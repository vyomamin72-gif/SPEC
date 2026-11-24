import { describe, expect, it } from 'vitest'
import projectileFixture from '../__fixtures__/projectile-quadratic-drag.json'
import { advanceExact, DROP_HEIGHT, NewtonModel, TRACK_HALF_LENGTH } from './newton'
import type { NewtonParams } from './newton'
import { dampedLinearPeriod, exactPeriod, linearSolution, PendulumModel, smallAnglePeriod } from './pendulum'
import type { PendulumParams } from './pendulum'
import { dragFreeTheory, ProjectileModel } from './projectile'
import type { ProjectileParams } from './projectile'

const G = 9.80665
const DT = 1e-3

/** Unwrap a value that the test requires to exist, failing clearly if it does not. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value')
  return value
}

function run<T extends { step(dt: number): void; finished: unknown }>(model: T, maxSteps = 1e7): T {
  for (let i = 0; i < maxSteps && !model.finished; i++) model.step(DT)
  return model
}

// ── Projectile ───────────────────────────────────────────────────────────
const projectile = (overrides: Partial<ProjectileParams> = {}): ProjectileParams => ({
  speed: 20, angleDeg: 45, launchHeight: 0, gravity: G, dragEnabled: false,
  mass: 0.145, dragCoefficient: 0.47, diameter: 0.0732, airDensity: 1.225, ...overrides,
})

describe('ProjectileModel', () => {
  // Drag-free: RK4 is exact and events are located to ~1e-12 s, so measured
  // values must equal the closed form to ~1e-9 (round-off accumulated over
  // thousands of steps, times speeds of up to ~100 m/s).
  it.each([
    [20, 45, 0],
    [35, 10, 0],
    [12, 80, 0],
    [25, 30, 15],
    [8, 0, 20],
  ])('matches the closed form for v₀ = %d m/s, θ = %d°, h₀ = %d m', (speed, angleDeg, launchHeight) => {
    const model = run(new ProjectileModel(projectile({ speed, angleDeg, launchHeight })))
    const theory = dragFreeTheory(speed, (angleDeg * Math.PI) / 180, launchHeight, G)
    expect(Math.abs(must(model.landing).time - theory.flightTime)).toBeLessThan(1e-9)
    expect(Math.abs(must(model.landing).x - theory.range)).toBeLessThan(1e-9)
    expect(Math.abs(must(model.apex).y - theory.maxHeight)).toBeLessThan(1e-9)
    expect(model.state[1]).toBe(0)
  })

  it('maximises range at 45° for launch and landing at the same height', () => {
    const ranges = [40, 44, 45, 46, 50].map((angleDeg) => must(run(new ProjectileModel(projectile({ angleDeg }))).landing).x)
    expect(Math.max(...ranges)).toBe(ranges[2])
  })

  it('reproduces the SciPy drag reference through its physical parameters', () => {
    const p = projectileFixture.parameters
    const model = run(
      new ProjectileModel(
        projectile({
          speed: p.speed, angleDeg: p.angleDeg, gravity: p.gravity, dragEnabled: true, mass: p.mass,
          dragCoefficient: p.dragCoefficient, airDensity: p.airDensity,
          diameter: 2 * Math.sqrt(p.crossSectionArea / Math.PI),
        }),
      ),
    )
    expect(Math.abs(must(model.landing).time - projectileFixture.landingTime)).toBeLessThan(1e-9)
    expect(Math.abs(must(model.landing).x - projectileFixture.landingState[0])).toBeLessThan(1e-8)
  })

  it('handles a launch that is already on the ground moving horizontally', () => {
    expect(new ProjectileModel(projectile({ angleDeg: 0 })).finished).toBe(true)
  })
})

// ── Pendulum ─────────────────────────────────────────────────────────────
const pendulum = (overrides: Partial<PendulumParams> = {}): PendulumParams => ({
  length: 1, mass: 1, amplitudeDeg: 10, gravity: G, dampingCoefficient: 0, model: 'nonlinear', integrator: 'rk4', ...overrides,
})

function runFor(model: PendulumModel, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) model.step(DT)
  return model
}

describe('PendulumModel', () => {
  // Measured period = difference of Hermite-timed crossings (error ~1e-12 s)
  // of an RK4 trajectory (error ~1e-11). 1e-8 relative leaves wide margin.
  it.each([5, 60, 150, 175])('measures the exact nonlinear period at θ₀ = %d°', (amplitudeDeg) => {
    const exact = exactPeriod(1, G, (amplitudeDeg * Math.PI) / 180)
    const model = runFor(new PendulumModel(pendulum({ amplitudeDeg })), 3.2 * exact)
    expect(Math.abs(model.measuredPeriod / exact - 1)).toBeLessThan(1e-8)
  })

  it('shows the small-angle model error grows with amplitude (model error, not numerical)', () => {
    const at5 = exactPeriod(1, G, (5 * Math.PI) / 180) / smallAnglePeriod(1, G) - 1
    const at60 = exactPeriod(1, G, Math.PI / 3) / smallAnglePeriod(1, G) - 1
    expect(at5).toBeLessThan(0.001)
    expect(at60).toBeGreaterThan(0.07)
  })

  it('linear model with damping measures 2π/ω_d', () => {
    const p = pendulum({ model: 'linear', amplitudeDeg: 20, dampingCoefficient: 0.4, mass: 2 })
    const model = runFor(new PendulumModel(p), 8)
    expect(Math.abs(model.measuredPeriod / dampedLinearPeriod(1, G, 0.2) - 1)).toBeLessThan(1e-8)
  })

  it.each([
    ['underdamped', 0.4],
    ['overdamped', 30],
  ])('linear model trajectory equals the exact solution (%s)', (_name, b) => {
    // Validates the theory curve shown in the graph: RK4 on the linear model
    // must reproduce linearSolution to integrator accuracy (~1e-11).
    const p = pendulum({ model: 'linear', amplitudeDeg: 10, dampingCoefficient: b })
    const model = new PendulumModel(p)
    let maxError = 0
    for (let i = 1; i <= 5000; i++) {
      model.step(DT)
      maxError = Math.max(maxError, Math.abs(model.state[0] - linearSolution(i * DT, (10 * Math.PI) / 180, G, b)))
    }
    expect(maxError).toBeLessThan(1e-9)
  })

  it('mass has no effect without damping', () => {
    const light = runFor(new PendulumModel(pendulum({ mass: 0.2, amplitudeDeg: 70 })), 3)
    const heavy = runFor(new PendulumModel(pendulum({ mass: 9, amplitudeDeg: 70 })), 3)
    expect(Array.from(heavy.state)).toEqual(Array.from(light.state))
  })

  it('conserves energy with RK4 and gains energy with explicit Euler (undamped)', () => {
    const drift = (integrator: PendulumParams['integrator']) => {
      const m = runFor(new PendulumModel(pendulum({ amplitudeDeg: 60, integrator })), 20)
      return m.totalEnergy() / m.initialEnergy - 1
    }
    expect(Math.abs(drift('rk4'))).toBeLessThan(1e-9)
    expect(drift('euler')).toBeGreaterThan(0.01)
  })
})

// ── Newton's laws ────────────────────────────────────────────────────────
const newton = (overrides: Partial<NewtonParams> = {}): NewtonParams => ({
  scenario: 'push', mass: 10, hangingMass: 3, appliedForce: 50, staticFriction: 0.5, kineticFriction: 0.3, gravity: G, ...overrides,
})

describe('NewtonModel — push', () => {
  it('stays at rest while the applied force is within the static limit', () => {
    const model = new NewtonModel(newton({ appliedForce: 0.5 * 10 * G }))
    for (let i = 0; i < 1000; i++) model.step(DT)
    expect(Array.from(model.state)).toEqual([0, 0])
    expect(model.forces()).toMatchObject({ frictionKind: 'static', net: 0 })
  })

  it('accelerates at (F − μk·N)/m and follows x = ½at² exactly', () => {
    const model = new NewtonModel(newton())
    for (let i = 0; i < 2000; i++) model.step(DT)
    const a = (50 - 0.3 * 10 * G) / 10
    expect(model.acceleration()).toBeCloseTo(a, 12)
    expect(Math.abs(model.state[0] - 0.5 * a * 2 ** 2)).toBeLessThan(1e-10)
    expect(model.forces().net).toBeCloseTo(10 * a, 10) // F_net = m·a
  })

  it('after the force is removed, stops at v²/(2μk·g) and never reverses', () => {
    const model = new NewtonModel(newton())
    for (let i = 0; i < 1000; i++) model.step(DT)
    const [x, v] = model.state
    model.setAppliedForce(0)
    let minVelocity = Infinity
    for (let i = 0; i < 5000; i++) {
      model.step(DT)
      minVelocity = Math.min(minVelocity, model.state[1])
    }
    expect(model.state[1]).toBe(0)
    expect(minVelocity).toBe(0)
    expect(Math.abs(must(model.lastStopPosition) - (x + v ** 2 / (2 * 0.3 * G)))).toBeLessThan(1e-10)
    expect(model.forceConstantSinceStart).toBe(false)
  })

  it('treats negative forces symmetrically and stops at the end of the track', () => {
    const model = run(new NewtonModel(newton({ appliedForce: -200 })))
    expect(model.finished).toBe('track-end')
    expect(model.state[0]).toBeCloseTo(-TRACK_HALF_LENGTH, 9)
    const a = (-200 + 0.3 * 10 * G) / 10
    expect(model.time).toBeCloseTo(Math.sqrt((2 * TRACK_HALF_LENGTH) / -a), 9)
  })

  it('clamps μk to μs', () => {
    expect(new NewtonModel(newton({ kineticFriction: 0.9 })).effectiveKineticFriction).toBe(0.5)
  })
})

describe('NewtonModel — pulley', () => {
  it('matches a = (m₂g − μk·m₁g)/(m₁+m₂), T = m₂(g − a), and the time to reach the floor', () => {
    const model = new NewtonModel(newton({ scenario: 'pulley', mass: 5, hangingMass: 3, staticFriction: 0.4 }))
    const a = (3 * G - 0.3 * 5 * G) / 8
    expect(model.acceleration()).toBeCloseTo(a, 12)
    model.step(DT)
    expect(model.forces().tension).toBeCloseTo(3 * (G - a), 12)
    run(model)
    expect(model.finished).toBe('floor')
    expect(model.time).toBeCloseTo(Math.sqrt((2 * DROP_HEIGHT) / a), 9)
  })

  it('stays at rest when the hanging weight cannot overcome static friction', () => {
    const model = new NewtonModel(newton({ scenario: 'pulley', mass: 10, hangingMass: 2 }))
    for (let i = 0; i < 1000; i++) model.step(DT)
    expect(model.state[0]).toBe(0)
    expect(model.forces().tension).toBeCloseTo(2 * G, 12)
  })
})

it('advanceExact stops exactly at rest inside a step', () => {
  const s = Float64Array.from([0, 1])
  advanceExact(s, 1, { mass: 1, drive: 0, staticLimit: 2, kineticForce: 2 }) // stops after 0.5 s
  expect(Array.from(s)).toEqual([0.25, 0])
})
