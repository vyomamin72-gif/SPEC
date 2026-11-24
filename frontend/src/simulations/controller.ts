import { toCsv } from '@/data/csv'
import { TimeSeriesRecorder } from '@/data/TimeSeriesRecorder'
import { FixedStepLoop } from '@/physics/core/loop'
import { readPalette } from '@/rendering/palette'
import type { Palette } from '@/rendering/palette'
import { defaultValues, SECONDS_CLOCK } from './types'
import type { ChartSpec, ParameterValue, ParameterValues, ReadoutGroup, SimulationClock, SimulationDefinition, SimulationInstance } from './types'

export interface ControllerSnapshot {
  values: ParameterValues
  isRunning: boolean
  speed: number
  time: number
  finished: boolean
  fellBehind: boolean
  readouts: ReadoutGroup[]
  notices: string[]
  /** Changes whenever recorded data changes; charts redraw on change. */
  dataVersion: number
  sampleCount: number
  recordingPaused: boolean
  clock: SimulationClock
  isStatic: boolean
}

const PUBLISH_INTERVAL_MS = 100
/** Samples kept per channel; older samples are dropped (bounded memory). */
export const SAMPLE_CAPACITY = 5000

/** uPlot's data layout: x values, then one array per series; null marks a gap. */
export type ChartData = [number[], ...(number | null)[][]]

/**
 * Runs one experiment outside React: owns the simulation instance, the
 * fixed-step loop, the animation-frame loop and canvas drawing. React reads it
 * through subscribe/getSnapshot (useSyncExternalStore). Snapshots are
 * published at most every 100 ms while running, so React re-renders ~10×/s
 * while physics and drawing run at full rate.
 */
export class SimulationController {
  readonly definition: SimulationDefinition
  private values: ParameterValues
  private instance!: SimulationInstance
  private loop!: FixedStepLoop
  private speed = 1
  private running = false
  private fellBehind = false
  private frameId: number | null = null
  private lastFrame: number | null = null
  private lastPublish = 0
  private canvas: HTMLCanvasElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private palette: Palette | null = null
  private listeners = new Set<() => void>()
  private snapshot!: ControllerSnapshot
  private recorder!: TimeSeriesRecorder<string>
  private recordingPaused = false
  private clock: SimulationClock = SECONDS_CLOCK

  constructor(definition: SimulationDefinition, values: ParameterValues = defaultValues(definition)) {
    this.definition = definition
    this.values = values
    this.rebuild()
  }

  // ── React integration ─────────────────────────────────────────────────
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ControllerSnapshot => this.snapshot

  /** Callback ref for the <canvas>. */
  attachCanvas = (canvas: HTMLCanvasElement | null): void => {
    this.resizeObserver?.disconnect()
    this.canvas = canvas
    if (!canvas) return
    this.palette = readPalette()
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.draw())
      this.resizeObserver.observe(canvas)
    }
    this.draw()
  }

  // ── Commands ──────────────────────────────────────────────────────────
  setParameter(key: string, value: ParameterValue): void {
    const spec = this.definition.parameters.find((p) => p.key === key)
    if (!spec || this.values[key] === value) return
    this.values = { ...this.values, [key]: value }
    if (spec.live && this.instance.update) {
      this.instance.update(this.values)
      if (this.instance.isStatic && this.running) this.pause(false)
    } else {
      this.pause(false)
      this.rebuild()
      return
    }
    this.draw()
    this.publish()
  }

  play(): void {
    if (this.running || this.instance.finished || this.instance.isStatic) return
    this.running = true
    this.lastFrame = null
    this.frameId = requestAnimationFrame(this.tick)
    this.publish()
  }

  pause(publish = true): void {
    this.running = false
    if (this.frameId !== null) cancelAnimationFrame(this.frameId)
    this.frameId = null
    if (publish) this.publish()
  }

  toggle(): void {
    if (this.running) this.pause()
    else this.play()
  }

  /** One fixed timestep. Ignored while running. */
  step(): void {
    if (this.running || this.instance.finished || this.instance.isStatic) return
    this.loop.stepOnce()
    this.draw()
    this.publish()
  }

  reset(): void {
    this.pause(false)
    this.rebuild()
  }

  setRecordingPaused(paused: boolean): void {
    this.recordingPaused = paused
    this.recorder.paused = paused
    this.publish()
  }

  clearRecording(): void {
    this.recorder.clear()
    this.publish()
  }

  /** Recorded data for one chart, in uPlot's layout. */
  chartData = (chart: ChartSpec): ChartData => {
    const toSeries = (values: Float64Array) => Array.from(values, (v) => (Number.isFinite(v) ? v : null))
    const scale = this.clock.secondsPerUnit
    return [Array.from(this.recorder.times(), (t) => t / scale), ...chart.series.map((s) => toSeries(this.recorder.series(s.key)))]
  }

  /** All recorded channels as CSV, with units in the headers. */
  toCsv(): string {
    return toCsv([
      { header: 't (s)', values: this.recorder.times() },
      ...this.definition.channels.map((c) => ({
        header: c.unit ? `${c.label} (${c.unit})` : c.label,
        values: this.recorder.series(c.key),
      })),
    ])
  }

  setSpeed(speed: number): void {
    this.speed = speed
    this.loop.speed = this.simulatedSecondsPerRealSecond()
    this.publish()
  }

  private simulatedSecondsPerRealSecond(): number {
    return this.speed * this.clock.secondsPerUnit * this.clock.unitsPerRealSecond
  }

  // ── Internals ─────────────────────────────────────────────────────────
  private rebuild(): void {
    const instance = this.definition.create(this.values)
    this.instance = instance
    const recorder = new TimeSeriesRecorder(
      this.definition.channels.map((c) => c.key),
      { interval: this.definition.sampleInterval(this.values), capacity: SAMPLE_CAPACITY },
    )
    recorder.paused = this.recordingPaused
    recorder.sample(0, instance.sample())
    this.recorder = recorder
    this.clock = this.definition.clock?.(this.values) ?? SECONDS_CLOCK
    const dt = this.definition.timestep?.(this.values) ?? this.definition.dt
    this.loop = new FixedStepLoop({ dt }, (_t, dt) => {
      if (instance.finished) return
      instance.step(dt)
      // Record on the simulation-time schedule; always record the final state.
      recorder.sample(instance.time, instance.sample(), instance.finished)
    })
    this.loop.speed = this.simulatedSecondsPerRealSecond()
    this.fellBehind = false
    this.draw()
    this.publish()
  }

  private tick = (now: number): void => {
    if (!this.running) return
    if (this.lastFrame !== null) this.fellBehind = this.loop.advance((now - this.lastFrame) / 1000).fellBehind
    this.lastFrame = now
    this.draw()
    if (this.instance.finished) {
      this.pause()
      return
    }
    if (now - this.lastPublish >= PUBLISH_INTERVAL_MS) this.publish(now)
    this.frameId = requestAnimationFrame(this.tick)
  }

  private draw(): void {
    const canvas = this.canvas
    if (!canvas) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.instance.render(ctx, width, height, this.palette ?? readPalette())
  }

  private publish(now = typeof performance !== 'undefined' ? performance.now() : 0): void {
    this.lastPublish = now
    this.snapshot = {
      values: this.values,
      isRunning: this.running,
      speed: this.speed,
      time: this.instance.time,
      finished: this.instance.finished,
      fellBehind: this.running && this.fellBehind,
      readouts: this.instance.readouts(),
      notices: this.instance.notices(),
      dataVersion: this.recorder.version,
      sampleCount: this.recorder.length,
      recordingPaused: this.recordingPaused,
      clock: this.clock,
      isStatic: this.instance.isStatic ?? false,
    }
    this.listeners.forEach((listener) => listener())
  }
}
