import type { Palette } from '@/rendering/palette'

export type SeriesColor = Exclude<keyof Palette, 'background' | 'grid' | 'gridLabel' | 'ink' | 'line'>

export type ParameterValue = number | boolean | string
export type ParameterValues = Record<string, ParameterValue>

interface ParameterBase {
  key: string
  label: string
  description?: string
  /** Applied to the running simulation without resetting it. */
  live?: boolean
  /** Hide this control unless the predicate holds (e.g. drag settings only when drag is on). */
  visibleWhen?: (values: ParameterValues) => boolean
}

export interface NumberParameter extends ParameterBase {
  kind: 'number'
  unit: string
  min: number
  max: number
  step: number
  defaultValue: number
}

export interface ChoiceParameter extends ParameterBase {
  kind: 'choice'
  options: readonly { value: string; label: string }[]
  defaultValue: string
}

export interface BooleanParameter extends ParameterBase {
  kind: 'boolean'
  defaultValue: boolean
}

export type ParameterSpec = NumberParameter | ChoiceParameter | BooleanParameter

export interface ReadoutItem {
  label: string
  unit: string
  /** Numeric value; NaN renders as "—" (not yet measured / undefined). */
  value?: number
  /** Non-numeric value, e.g. "static". */
  text?: string
  description?: string
  sigFigs?: number
}

export interface ReadoutGroup {
  title: string
  items: ReadoutItem[]
}

export interface Equation {
  label: string
  expression: string
}

/** A recorded quantity. Every channel is recorded and exported to CSV. */
export interface ChannelSpec {
  key: string
  label: string
  unit: string
}

export interface ChartSpec {
  id: string
  title: string
  /** Unit shared by every series on the y axis. */
  unit: string
  series: readonly { key: string; color: SeriesColor; /** analytic curve: drawn dashed */ theory?: boolean }[]
}

/** One running experiment: owns the physical state, renders it and reports measurements. */
export interface SimulationInstance {
  /** Simulated time in seconds (authoritative; stops when the experiment ends). */
  readonly time: number
  /** True when the experiment has reached its end (e.g. the projectile landed). */
  readonly finished: boolean
  /** Nothing evolves in time in the current configuration (e.g. a static field map). */
  readonly isStatic?: boolean
  step(dt: number): void
  readouts(): ReadoutGroup[]
  notices(): string[]
  render(ctx: CanvasRenderingContext2D, width: number, height: number, palette: Palette): void
  /** Current values of the definition's channels, in the same order. NaN where a value does not apply. */
  sample(): number[]
  /** Apply parameters marked `live` without resetting. */
  update?(values: ParameterValues): void
}

/**
 * How simulated time is shown and paced. The physics always runs in SI
 * seconds; an orbit lasting weeks is shown in days and played at, e.g.,
 * one day per real second at 1× speed.
 */
export interface SimulationClock {
  unit: string
  secondsPerUnit: number
  /** Display units of simulated time per real second at 1× speed. */
  unitsPerRealSecond: number
}

export const SECONDS_CLOCK: SimulationClock = { unit: 's', secondsPerUnit: 1, unitsPerRealSecond: 1 }

export interface SimulationDefinition {
  id: string
  /** Fixed physics timestep, s (overridden by `timestep` when given). */
  dt: number
  /** Timestep that depends on the parameters (e.g. on the orbital scale), s. */
  timestep?(values: ParameterValues): number
  clock?(values: ParameterValues): SimulationClock
  parameters: readonly ParameterSpec[]
  equations: readonly Equation[]
  channels: readonly ChannelSpec[]
  charts: readonly ChartSpec[]
  /** Simulation-time interval between recorded samples, s. */
  sampleInterval(values: ParameterValues): number
  /** Text alternative for the canvas. */
  canvasDescription: string
  create(values: ParameterValues): SimulationInstance
}

export function defaultValues(definition: SimulationDefinition): ParameterValues {
  return Object.fromEntries(definition.parameters.map((p) => [p.key, p.defaultValue]))
}

/** Typed accessors that fail loudly on a wrong key or type instead of producing NaN physics. */
export function num(values: ParameterValues, key: string): number {
  const v = values[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`parameter ${key} must be a finite number`)
  return v
}
export function bool(values: ParameterValues, key: string): boolean {
  const v = values[key]
  if (typeof v !== 'boolean') throw new TypeError(`parameter ${key} must be a boolean`)
  return v
}
export function choice<T extends string>(values: ParameterValues, key: string, allowed: readonly T[]): T {
  const v = values[key]
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new TypeError(`parameter ${key} invalid`)
  return v as T
}
