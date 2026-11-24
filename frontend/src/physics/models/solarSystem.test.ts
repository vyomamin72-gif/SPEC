import { describe, expect, it } from 'vitest'
import { keplerPeriod } from '../analysis/kepler'
import { OrbitTracker } from '../analysis/orbitTracker'
import { GRAVITATIONAL_CONSTANT as G, NBodyModel } from './nbody'
import { ASTRONOMICAL_UNIT, DAY, PLANETS, SOLAR_MASS, solarSystemBodies } from './solarSystem'

describe('OrbitTracker', () => {
  it('times full turns of a uniformly rotating angle', () => {
    const tracker = new OrbitTracker(0)
    for (let i = 1; i <= 3500; i++) tracker.update(i * 0.001, (i * 0.001 * 2 * Math.PI) % (2 * Math.PI))
    expect(tracker.orbits).toBe(3)
    expect(tracker.period).toBeCloseTo(1, 9)
  })
})

describe('solar system', () => {
  it('measured planetary periods match Kepler’s third law and the observed sidereal periods', () => {
    // 12 years at dt = 0.1 day (≈ 880 steps per Mercury orbit), velocity Verlet.
    const model = new NBodyModel({ bodies: solarSystemBodies(), interaction: 'gravity', softening: 0, integrator: 'velocity-verlet', centreOfMassFrame: true })
    const angle = (i: number) => {
      const [sx, sy] = model.position(0)
      const [x, y] = model.position(i)
      return Math.atan2(y - sy, x - sx)
    }
    const trackers = PLANETS.map((_, k) => new OrbitTracker(angle(k + 1)))
    const e0 = model.kineticEnergy() + model.potentialEnergy()
    const dt = 0.1 * DAY
    for (let step = 0; step < 12 * 3653; step++) {
      model.step(dt)
      trackers.forEach((t, k) => t.update(model.time, angle(k + 1)))
    }
    for (const name of ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter']) {
      const k = PLANETS.findIndex((p) => p.name === name)
      const p = PLANETS[k]
      const measured = trackers[k].period / DAY
      const kepler = keplerPeriod(p.a * ASTRONOMICAL_UNIT, G * (SOLAR_MASS + p.mass)) / DAY
      // Tolerance: the period of one particular orbit differs from the mean
      // (Keplerian) period by planetary perturbations, mostly from Jupiter,
      // at the 1e-3 level; it is not an integrator error.
      expect(Math.abs(measured / kepler - 1), name).toBeLessThan(3e-3)
      expect(Math.abs(measured / p.siderealPeriodDays - 1), name).toBeLessThan(3e-3)
    }
    expect(Math.abs((model.kineticEnergy() + model.potentialEnergy()) / e0 - 1)).toBeLessThan(1e-6)
  })
})
