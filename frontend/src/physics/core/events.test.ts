import { describe, expect, it } from 'vitest'
import projectileFixture from '../__fixtures__/projectile-quadratic-drag.json'
import { locateEvent } from './events'
import { createStepper } from './integrators'
import type { MechanicalSystem } from './integrators'
import { projectileWithDrag } from './testSystems'

const G = 9.80665
const height = (s: Float64Array) => s[1]

/** Integrate a projectile with RK4 until it lands; locate the landing inside the last step. */
function flyUntilLanding(system: MechanicalSystem, initial: number[], dt: number, onSample?: (step: number, s: Float64Array) => void) {
  const stepper = createStepper('rk4', system)
  const state = Float64Array.from(initial)
  for (let step = 0; step < 1e7; step++) {
    onSample?.(step, state)
    const before = state.slice()
    stepper.step(step * dt, state, dt)
    if (height(state) < 0) {
      const event = locateEvent(before, dt, (s, h) => stepper.step(step * dt, s, h), height)
      return { landingTime: step * dt + event.h, landingState: event.state }
    }
  }
  throw new Error('never landed')
}

describe('landing detection', () => {
  it('is exact (to round-off) for drag-free motion, where RK4 is exact', () => {
    const v0 = 25
    const angle = (35 * Math.PI) / 180
    const { landingTime, landingState } = flyUntilLanding(
      projectileWithDrag(1, G, 0),
      [0, 0, v0 * Math.cos(angle), v0 * Math.sin(angle)],
      0.01,
    )
    expect(Math.abs(landingTime - (2 * v0 * Math.sin(angle)) / G)).toBeLessThan(1e-11)
    expect(Math.abs(landingState[0] - (v0 ** 2 * Math.sin(2 * angle)) / G)).toBeLessThan(1e-9)
    expect(Math.abs(landingState[1])).toBeLessThan(1e-9)
  })

  it('matches the SciPy reference with quadratic drag', () => {
    const p = projectileFixture.parameters
    const angle = (p.angleDeg * Math.PI) / 180
    const dragFactor = 0.5 * p.airDensity * p.dragCoefficient * p.crossSectionArea
    const dt = 1e-3
    const stepsPerSample = 50 // fixture interval 0.05 s
    let maxSampleError = 0
    const { landingTime, landingState } = flyUntilLanding(
      projectileWithDrag(p.mass, p.gravity, dragFactor),
      [0, 0, p.speed * Math.cos(angle), p.speed * Math.sin(angle)],
      dt,
      (step, s) => {
        if (step % stepsPerSample !== 0) return
        const reference = projectileFixture.states[step / stepsPerSample]
        for (let i = 0; i < 4; i++) maxSampleError = Math.max(maxSampleError, Math.abs(s[i] - reference[i]))
      },
    )
    // Measured: max state error 2.4e-10, landing-time error 9.7e-13 s, range
    // error 1.6e-11 m. Tolerances leave ≥ 40× margin for platform differences;
    // a naive "first step below ground" landing would be off by up to vₓ·dt ≈ 3e-2 m.
    expect(maxSampleError).toBeLessThan(1e-8)
    expect(Math.abs(landingTime - projectileFixture.landingTime)).toBeLessThan(1e-9)
    expect(Math.abs(landingState[0] - projectileFixture.landingState[0])).toBeLessThan(1e-8)
  })

  it('refuses a step over which the event function does not change sign', () => {
    const stepper = createStepper('rk4', projectileWithDrag(1, G, 0))
    expect(() =>
      locateEvent(Float64Array.from([0, 10, 1, 1]), 0.01, (s, h) => stepper.step(0, s, h), height),
    ).toThrow(RangeError)
  })
})
