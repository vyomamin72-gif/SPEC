import { describe, expect, it } from 'vitest'
import { CircularModel } from './circular'
import { collisionEnergyLoss, CollisionModel, resolveVelocities } from './collisions'

const DT = 1e-3

function two(e: number, m1 = 1, m2 = 3, v1 = 2, v2 = -1) {
  return new CollisionModel({
    bodies: [
      { mass: m1, x: 2, v: v1, width: 0.5 },
      { mass: m2, x: 7, v: v2, width: 0.5 },
    ],
    restitution: e,
    walls: false,
    trackLength: 10,
  })
}

describe('CollisionModel', () => {
  it.each([0, 0.5, 1])('conserves momentum to round-off and loses exactly ½μ(1−e²)Δv² (e = %d)', (e) => {
    const model = two(e)
    const p0 = model.momentum
    const k0 = model.kineticEnergy
    for (let i = 0; i < 4000; i++) model.step(DT)
    expect(model.collisions).toHaveLength(1)
    expect(Math.abs(model.momentum - p0)).toBeLessThan(1e-12)
    expect(k0 - model.kineticEnergy).toBeCloseTo(collisionEnergyLoss(1, 2, 3, -1, e), 12)
  })

  it('collides at the exact contact time, not at a step boundary', () => {
    const model = two(1)
    for (let i = 0; i < 4000; i++) model.step(DT)
    // Gap 4.5 m closing at 3 m/s → contact at t = 1.5 s exactly (not a multiple-of-dt guess).
    expect(model.collisions[0].time).toBeCloseTo(1.5, 12)
  })

  it('equal masses exchange velocities in an elastic collision', () => {
    expect(resolveVelocities(2, 3, 2, -1, 1)).toEqual([-1, 3])
  })

  it('perfectly inelastic bodies move off together', () => {
    const model = two(0)
    for (let i = 0; i < 4000; i++) model.step(DT)
    expect(model.bodies[0].v).toBeCloseTo(model.bodies[1].v, 14)
  })

  it('transmits momentum down a chain of three equal bodies (elastic)', () => {
    const model = new CollisionModel({
      bodies: [0, 1, 2].map((i) => ({ mass: 1, x: 2 + 2 * i, v: i === 0 ? 1 : 0, width: 0.5 })),
      restitution: 1,
      walls: false,
      trackLength: 10,
    })
    for (let i = 0; i < 8000; i++) model.step(DT)
    expect(model.bodies.map((b) => b.v)).toEqual([0, 0, 1])
  })

  it('stays bounded with walls and low restitution (inelastic-collapse safeguard)', () => {
    const model = new CollisionModel({
      bodies: [0, 1, 2].map((i) => ({ mass: 1 + i, x: 2 + 3 * i, v: [3, -2, 1][i], width: 0.5 })),
      restitution: 0.1,
      walls: true,
      trackLength: 10,
    })
    for (let i = 0; i < 20000; i++) model.step(DT) // must terminate
    for (const b of model.bodies) {
      expect(b.x).toBeGreaterThanOrEqual(b.width / 2 - 1e-9)
      expect(b.x).toBeLessThanOrEqual(10 - b.width / 2 + 1e-9)
    }
  })

  it('finishes 3 s after the last possible collision when there are no walls', () => {
    const model = two(1)
    let steps = 0
    while (!model.finished && steps < 1e5) {
      model.step(DT)
      steps++
    }
    // Detected at a step boundary, so within one dt of 4.5 s (last contact 1.5 s + 3 s).
    expect(Math.abs(model.time - 4.5)).toBeLessThanOrEqual(DT + 1e-9)
  })
})

describe('CircularModel', () => {
  const base = { radius: 2, mass: 0.5, initialOmega: 3, tangentialForce: 0 }

  it('uniform motion stays on the circle and returns after one period 2π/ω', () => {
    const model = new CircularModel(base)
    const period = (2 * Math.PI) / 3
    const steps = Math.round(period / DT)
    for (let i = 0; i < steps; i++) model.step(DT)
    const [x, y] = model.position
    expect(Math.hypot(x, y)).toBeCloseTo(2, 12)
    expect(model.tension).toBeCloseTo(0.5 * 9 * 2, 12) // T = mω²r
    expect(model.angular[0]).toBeCloseTo(3 * steps * DT, 10)
  })

  it('constant tangential force gives ω = ω₀ + (F/(m r)) t exactly', () => {
    const model = new CircularModel({ ...base, tangentialForce: 1 })
    for (let i = 0; i < 2000; i++) model.step(DT)
    expect(model.angular[1]).toBeCloseTo(3 + (1 / (0.5 * 2)) * 2, 10)
  })

  it('after the cut the body moves tangentially in a straight line', () => {
    const model = new CircularModel(base)
    for (let i = 0; i < 500; i++) model.step(DT)
    model.cut()
    const [vx, vy] = model.velocity
    const [x0, y0] = model.position
    expect(vx * x0 + vy * y0).toBeCloseTo(0, 10) // velocity ⟂ radius at the cut
    for (let i = 0; i < 1000; i++) model.step(DT)
    const [x, y] = model.position
    expect(Math.hypot(x, y)).toBeCloseTo(Math.hypot(2, 6 * 1), 9) // √(r² + (v t)²)
    expect(model.tension).toBe(0)
  })
})
