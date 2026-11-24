import { describe, expect, it } from 'vitest'
import pendulumFixture from '../__fixtures__/pendulum-damped-large-amplitude.json'
import { createStepper, INTEGRATOR_INFO } from './integrators'
import type { IntegratorName, MechanicalSystem } from './integrators'
import { dampedPendulum, harmonicOscillator } from './testSystems'

function integrate(name: IntegratorName, system: MechanicalSystem, initial: number[], dt: number, steps: number) {
  const state = Float64Array.from(initial)
  const stepper = createStepper(name, system)
  for (let i = 0; i < steps; i++) stepper.step(i * dt, state, dt)
  return state
}

const NAMES = Object.keys(INTEGRATOR_INFO) as IntegratorName[]

describe('convergence order against the SciPy reference (damped nonlinear pendulum, θ₀ = 2.5 rad)', () => {
  // The observed order p = log₂(e(dt)/e(dt/2)) must match theory. An
  // implementation bug almost always shows up as the wrong order, even when a
  // fixed tolerance would happen to pass.
  const { length, gravity, dampingRate, theta0, omega0 } = pendulumFixture.parameters
  const system = dampedPendulum(length, gravity, dampingRate)
  const T = 5
  const reference = pendulumFixture.states[pendulumFixture.times.findIndex((t) => Math.abs(t - T) < 1e-12)]
  // dt pairs chosen so errors are in the asymptotic regime and far above the
  // reference's own error (~1e-11).
  const dtPairs: Record<IntegratorName, [number, number]> = {
    euler: [1e-3, 5e-4],
    'semi-implicit-euler': [1e-3, 5e-4],
    'velocity-verlet': [1e-3, 5e-4],
    rk4: [1e-2, 5e-3],
  }

  it.each(NAMES)('%s', (name) => {
    const errors = dtPairs[name].map((dt) => {
      const s = integrate(name, system, [theta0, omega0], dt, Math.round(T / dt))
      return Math.max(Math.abs(s[0] - reference[0]), Math.abs(s[1] - reference[1]))
    })
    const observedOrder = Math.log2(errors[0] / errors[1])
    expect(observedOrder).toBeGreaterThan(INTEGRATOR_INFO[name].order - 0.15)
    expect(observedOrder).toBeLessThan(INTEGRATOR_INFO[name].order + 0.15)
  })
})

describe('RK4 reproduces the reference trajectory', () => {
  it('stays within 1e-9 rad of SciPy over 10 s at dt = 1 ms', () => {
    // Measured maximum error: 3.9e-11 (RK4 global error ∝ dt⁴, confirmed by
    // the order test above). 1e-9 gives ~25× margin for platform differences
    // while any real defect (wrong order, wrong coefficient) exceeds it by far.
    const { length, gravity, dampingRate, theta0, omega0 } = pendulumFixture.parameters
    const stepper = createStepper('rk4', dampedPendulum(length, gravity, dampingRate))
    const state = Float64Array.from([theta0, omega0])
    const dt = 1e-3
    let maxError = 0
    pendulumFixture.times.forEach((t, i) => {
      const targetStep = Math.round(t / dt)
      for (let step = Math.round((pendulumFixture.times[i - 1] ?? 0) / dt); step < targetStep; step++) {
        stepper.step(step * dt, state, dt)
      }
      const [theta, omega] = pendulumFixture.states[i]
      maxError = Math.max(maxError, Math.abs(state[0] - theta), Math.abs(state[1] - omega))
    })
    expect(maxError).toBeLessThan(1e-9)
  })
})

describe('exact discrete energy behaviour on the harmonic oscillator (ω = 1, h = 0.1)', () => {
  // For q'' = −ω²q each method is a fixed linear map, so its effect on the
  // energy E = v² + ω²q² is known in closed form. These are identities, so the
  // tolerances only cover floating-point round-off.
  const omega = 1
  const h = 0.1
  const energy = (s: Float64Array) => s[1] ** 2 + omega ** 2 * s[0] ** 2

  it('explicit Euler multiplies energy by exactly (1 + ω²h²) per step', () => {
    const steps = 1000
    const s = integrate('euler', harmonicOscillator(omega), [1, 0], h, steps)
    expect(energy(s) / 1).toBeCloseTo((1 + (omega * h) ** 2) ** steps, 6)
    expect(energy(s) / (1 + (omega * h) ** 2) ** steps - 1).toBeLessThan(1e-10)
  })

  it('RK4 multiplies energy by exactly |R(iωh)|² per step (slow decay)', () => {
    const z = omega * h
    const factor = (1 - z ** 2 / 2 + z ** 4 / 24) ** 2 + (z - z ** 3 / 6) ** 2
    const steps = 10_000
    const s = integrate('rk4', harmonicOscillator(omega), [1, 0], h, steps)
    expect(Math.abs(energy(s) / factor ** steps - 1)).toBeLessThan(1e-10)
    expect(energy(s)).toBeLessThan(1) // it does drift, downward
  })

  it('semi-implicit Euler exactly conserves v² + ω²q² − hω²qv (energy stays bounded)', () => {
    const stepper = createStepper('semi-implicit-euler', harmonicOscillator(omega))
    const s = Float64Array.from([1, 0])
    const invariant = () => s[1] ** 2 + omega ** 2 * s[0] ** 2 - h * omega ** 2 * s[0] * s[1]
    const initial = invariant()
    let maxEnergyDeviation = 0
    for (let i = 0; i < 10_000; i++) {
      stepper.step(i * h, s, h)
      maxEnergyDeviation = Math.max(maxEnergyDeviation, Math.abs(energy(s) - 1))
    }
    expect(Math.abs(invariant() - initial)).toBeLessThan(1e-12)
    expect(maxEnergyDeviation).toBeLessThan(omega * h) // bounded by O(ωh), no drift
  })

  it('velocity Verlet exactly conserves v² + ω²q²(1 − ω²h²/4)', () => {
    const stepper = createStepper('velocity-verlet', harmonicOscillator(omega))
    const s = Float64Array.from([1, 0])
    const invariant = () => s[1] ** 2 + omega ** 2 * s[0] ** 2 * (1 - (omega * h) ** 2 / 4)
    const initial = invariant()
    for (let i = 0; i < 10_000; i++) stepper.step(i * h, s, h)
    expect(Math.abs(invariant() - initial)).toBeLessThan(1e-12)
  })
})

describe('constant acceleration', () => {
  // Uniform gravity: the exact solution is quadratic in t. RK4 and Verlet
  // reproduce it exactly, so only round-off remains.
  const g = 9.80665
  const gravityOnly: MechanicalSystem = {
    dof: 1,
    acceleration(_t, _q, _v, a) {
      a[0] = -g
    },
  }

  it.each(['rk4', 'velocity-verlet'] as const)('%s is exact', (name) => {
    const s = integrate(name, gravityOnly, [0, 20], 0.01, 300)
    expect(Math.abs(s[0] - (20 * 3 - 0.5 * g * 9))).toBeLessThan(1e-10)
    expect(Math.abs(s[1] - (20 - g * 3))).toBeLessThan(1e-10)
  })

  it('explicit Euler is not (first-order position error)', () => {
    const s = integrate('euler', gravityOnly, [0, 20], 0.01, 300)
    expect(Math.abs(s[0] - (20 * 3 - 0.5 * g * 9))).toBeCloseTo(0.5 * g * 3 * 0.01, 10)
  })
})

it('rejects a state array of the wrong length', () => {
  const stepper = createStepper('rk4', harmonicOscillator(1))
  expect(() => stepper.step(0, new Float64Array(3), 0.01)).toThrow(RangeError)
})
