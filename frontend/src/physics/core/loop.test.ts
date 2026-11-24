import { describe, expect, it } from 'vitest'
import { createStepper } from './integrators'
import { FixedStepLoop } from './loop'
import { dampedPendulum } from './testSystems'

// Binary-exact timesteps (powers of two) keep these tests free of rounding ambiguity.
const DT = 1 / 64

function countingLoop(config: Partial<ConstructorParameters<typeof FixedStepLoop>[0]> = {}) {
  const calls: number[] = []
  const loop = new FixedStepLoop({ dt: DT, ...config }, (t) => calls.push(t))
  return { loop, calls }
}

describe('FixedStepLoop', () => {
  it('takes whole fixed steps for the elapsed real time', () => {
    const { loop, calls } = countingLoop()
    expect(loop.advance(1 / 16)).toEqual({ steps: 4, fellBehind: false })
    expect(calls).toEqual([0, DT, 2 * DT, 3 * DT])
    expect(loop.time).toBe(4 * DT)
  })

  it('carries leftover time to the next frame', () => {
    const { loop } = countingLoop()
    expect(loop.advance(1.5 * DT).steps).toBe(1)
    expect(loop.alpha).toBeCloseTo(0.5, 12)
    expect(loop.advance(0.5 * DT).steps).toBe(1)
  })

  it('scales simulated time by speed without changing dt', () => {
    const { loop, calls } = countingLoop()
    loop.speed = 4
    loop.advance(1 / 16)
    expect(calls).toHaveLength(16)
    expect(loop.dt).toBe(DT)
  })

  it('clamps very long frames (e.g. after a hidden tab)', () => {
    const { loop } = countingLoop({ maxFrameTime: 0.25 })
    expect(loop.advance(10).steps).toBe(16)
  })

  it('caps steps per frame, discards the backlog and reports falling behind', () => {
    const { loop } = countingLoop({ maxStepsPerFrame: 5 })
    loop.speed = 4
    expect(loop.advance(1 / 16)).toEqual({ steps: 5, fellBehind: true })
    expect(loop.alpha).toBeLessThan(1)
    expect(loop.advance(0).steps).toBe(0)
  })

  it('ignores non-positive and non-finite elapsed times', () => {
    const { loop } = countingLoop()
    for (const bad of [0, -1, Number.NaN, Infinity]) expect(loop.advance(bad).steps).toBe(0)
  })

  it('single-steps and resets', () => {
    const { loop, calls } = countingLoop()
    loop.stepOnce()
    loop.stepOnce()
    expect(calls).toEqual([0, DT])
    loop.reset()
    expect(loop.time).toBe(0)
    expect(loop.alpha).toBe(0)
  })

  it('rejects invalid dt and speed', () => {
    expect(() => new FixedStepLoop({ dt: 0 }, () => {})).toThrow(RangeError)
    expect(() => new FixedStepLoop({ dt: Number.NaN }, () => {})).toThrow(RangeError)
    const { loop } = countingLoop()
    expect(() => (loop.speed = -1)).toThrow(RangeError)
  })
})

describe('frame-rate independence', () => {
  /** Run a pendulum for `total` real seconds split into the given frame durations. */
  function run(frames: number[]) {
    const stepper = createStepper('rk4', dampedPendulum(1, 9.80665, 0.1))
    const state = Float64Array.from([1.2, 0])
    const loop = new FixedStepLoop({ dt: 1e-3 }, (t, dt) => stepper.step(t, state, dt))
    for (const frame of frames) loop.advance(frame)
    return { state, steps: loop.steps }
  }

  function split(total: number, count: number, jitter: boolean) {
    let seed = 12345
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const weights = Array.from({ length: count }, () => (jitter ? 0.2 + random() : 1))
    const sum = weights.reduce((a, b) => a + b, 0)
    return weights.map((w) => (w / sum) * total)
  }

  it('gives bit-identical results at 30 Hz, 144 Hz and with jittery frames', () => {
    // 3.0004 s is deliberately not a multiple of dt, so rounding in the frame
    // sums cannot move the total across a step boundary.
    const total = 3.0004
    const at30 = run(split(total, 90, false))
    const at144 = run(split(total, 432, false))
    const jittery = run(split(total, 200, true))
    expect(at30.steps).toBe(3000)
    for (const other of [at144, jittery]) {
      expect(other.steps).toBe(at30.steps)
      expect(Array.from(other.state)).toEqual(Array.from(at30.state)) // exact equality, not closeness
    }
  })
})
