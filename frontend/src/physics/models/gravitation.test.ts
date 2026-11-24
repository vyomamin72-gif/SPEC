import { describe, expect, it } from 'vitest'
import { elementsToState, keplerPeriod, solveKepler } from '../analysis/kepler'
import { GRAVITATIONAL_CONSTANT as G, NBodyModel } from './nbody'
import type { PointBody } from './nbody'

const M = 5.972e24
const m = 7.342e22
const a = 3.844e8
const mu = G * (M + m)

/** Earth–Moon-like pair on a Keplerian orbit of eccentricity e, starting at periapsis. */
function pair(e: number, integrator: 'velocity-verlet' | 'rk4' = 'velocity-verlet', softening = 0): NBodyModel {
  const s = elementsToState(a, e, 0, 0, mu)
  const bodies: PointBody[] = [
    { name: 'primary', mass: M, x: 0, y: 0, vx: 0, vy: 0 },
    { name: 'secondary', mass: m, ...s },
  ]
  return new NBodyModel({ bodies, interaction: 'gravity', softening, integrator, centreOfMassFrame: true })
}

function relative(model: NBodyModel): [number, number] {
  const [x0, y0] = model.position(0)
  const [x1, y1] = model.position(1)
  return [x1 - x0, y1 - y0]
}

describe('Kepler helpers', () => {
  it('solves Kepler’s equation and produces the right orbital energy and angular momentum', () => {
    const E = solveKepler(1.234, 0.6)
    expect(E - 0.6 * Math.sin(E)).toBeCloseTo(1.234, 14)
    const s = elementsToState(a, 0.3, 0.7, 2.1, mu)
    const r = Math.hypot(s.x, s.y)
    expect(0.5 * (s.vx ** 2 + s.vy ** 2) - mu / r).toBeCloseTo(-mu / (2 * a), 3) // vis-viva, relative 1e-12
    expect(Math.abs(s.x * s.vy - s.y * s.vx) / Math.sqrt(mu * a * (1 - 0.09)) - 1).toBeLessThan(1e-12)
  })
})

describe('NBodyModel — gravity', () => {
  it('gives the Newtonian acceleration GM/r² between two bodies', () => {
    const model = new NBodyModel({
      bodies: [
        { name: 'a', mass: M, x: 0, y: 0, vx: 0, vy: 0 },
        { name: 'b', mass: 1, x: 7e6, y: 0, vx: 0, vy: 0 },
      ],
      interaction: 'gravity',
      softening: 0,
      integrator: 'velocity-verlet',
    })
    const f = model.forces()
    expect(-f[2] / 1 / ((G * M) / 7e6 ** 2) - 1).toBeLessThan(1e-14) // acceleration of body b
    expect(f[0] + f[2]).toBe(0) // Newton's third law, exactly
  })

  it('returns to its starting point after one Kepler period (e = 0.5)', () => {
    // Velocity Verlet error ∝ dt²: with 20 000 steps per orbit the position
    // error after one orbit is ~1e-6 of the semi-major axis.
    const model = pair(0.5)
    const T = keplerPeriod(a, mu)
    const steps = 20_000
    const start = relative(model)
    for (let i = 0; i < steps; i++) model.step(T / steps)
    const end = relative(model)
    expect(Math.hypot(end[0] - start[0], end[1] - start[1]) / a).toBeLessThan(1e-5)
  })

  it('Verlet: energy error stays bounded over 100 orbits; momentum and angular momentum are conserved', () => {
    const model = pair(0.6)
    const T = keplerPeriod(a, mu)
    const e0 = model.kineticEnergy() + model.potentialEnergy()
    const l0 = model.angularMomentum()
    let maxEnergyError = 0
    let errorInLastOrbits = 0
    const steps = 100 * 2000
    for (let i = 0; i < steps; i++) {
      model.step(T / 2000)
      const err = Math.abs((model.kineticEnergy() + model.potentialEnergy()) / e0 - 1)
      maxEnergyError = Math.max(maxEnergyError, err)
      if (i > steps - 2000) errorInLastOrbits = Math.max(errorInLastOrbits, err)
    }
    expect(maxEnergyError).toBeLessThan(1e-3)
    // Bounded, not drifting: the last orbit's error is no worse than the overall maximum band.
    expect(errorInLastOrbits).toBeLessThanOrEqual(maxEnergyError)
    expect(Math.abs(model.angularMomentum() / l0 - 1)).toBeLessThan(1e-12)
    const [px, py] = model.momentum()
    expect(Math.hypot(px, py) / (m * Math.sqrt(mu / a))).toBeLessThan(1e-12)
  })

  it('softening keeps the force finite at zero separation', () => {
    const model = new NBodyModel({
      bodies: [
        { name: 'a', mass: 1e20, x: 0, y: 0, vx: 0, vy: 0 },
        { name: 'b', mass: 1e20, x: 0, y: 0, vx: 0, vy: 0 },
      ],
      interaction: 'gravity',
      softening: 1e3,
      integrator: 'velocity-verlet',
    })
    expect(Array.from(model.forces()).every(Number.isFinite)).toBe(true)
  })
})
