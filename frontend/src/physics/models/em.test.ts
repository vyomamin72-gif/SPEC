import { describe, expect, it } from 'vitest'
import { kirchhoffResiduals, solveCircuit } from './circuit'
import type { Circuit } from './circuit'
import { borisStep, electricField, EPSILON_0, MU_0, traceFieldLine, wireField } from './fields'
import { dipoleFlux, dipoleFluxGradient, inducedEmf } from './induction'
import { COULOMB_CONSTANT as K, NBodyModel } from './nbody'

describe('electric field', () => {
  it('a single charge gives kq/r² radially', () => {
    const [ex, ey] = electricField([{ q: 2e-9, x: 0, y: 0 }], 0.3, 0.4)
    expect(Math.hypot(ex, ey) / ((K * 2e-9) / 0.25) - 1).toBeLessThan(1e-14)
    expect(ex / ey).toBeCloseTo(0.75, 14)
  })

  it('Gauss’s law: flux through a circle around +q equals q/ε₀ per unit length (2D slice of a 3D field)', () => {
    // For a point charge, the flux through a sphere is q/ε₀. Integrate numerically over a sphere
    // (θ, φ grid) around one charge of a dipole: the other charge is outside and contributes zero.
    const charges = [{ q: 3e-9, x: 0, y: 0 }, { q: -3e-9, x: 0.5, y: 0 }]
    const R = 0.2
    let flux = 0
    const N = 400
    for (let i = 0; i < N; i++) {
      const theta = ((i + 0.5) * Math.PI) / N
      // Field depends only on (x, ρ) by symmetry about the x axis: evaluate in the plane.
      const x = R * Math.cos(theta)
      const rho = R * Math.sin(theta)
      const [ex, ey] = electricField(charges, x, rho)
      const radial = ex * Math.cos(theta) + ey * Math.sin(theta)
      flux += radial * 2 * Math.PI * R * R * Math.sin(theta) * (Math.PI / N)
    }
    expect(Math.abs((flux * EPSILON_0) / 3e-9 - 1)).toBeLessThan(1e-5)
  })

  it('field lines from +q end on −q for a dipole', () => {
    const charges = [{ q: 1e-9, x: -0.1, y: 0 }, { q: -1e-9, x: 0.1, y: 0 }]
    const line = traceFieldLine((x, y) => electricField(charges, x, y), [-0.1 + 0.005 * Math.cos(1), 0.005 * Math.sin(1)], {
      step: 0.002,
      maxSteps: 5000,
      bounds: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
      stop: (x, y) => Math.hypot(x - 0.1, y) < 0.004,
    })
    const [xe, ye] = line[line.length - 1]
    expect(Math.hypot(xe - 0.1, ye)).toBeLessThan(0.006)
  })
})

describe('magnetic field', () => {
  it('a long wire gives μ₀I/(2πr), circling by the right-hand rule', () => {
    const [bx, by] = wireField([{ current: 5, x: 0, y: 0 }], 0.1, 0)
    expect(bx).toBeCloseTo(0, 20)
    expect(by / ((MU_0 * 5) / (2 * Math.PI * 0.1)) - 1).toBeLessThan(1e-14) // out of page current → counter-clockwise B
  })

  it('Boris pusher: cyclotron radius mv/(qB), period 2πm/(qB), speed conserved to round-off', () => {
    const qm = 1e7 // C/kg
    const B = 0.01
    const v = 1e4
    const state = Float64Array.from([0, 0, v, 0])
    const period = (2 * Math.PI) / (qm * B)
    const steps = 2000
    let [yMin, yMax] = [0, 0]
    for (let i = 0; i < steps; i++) {
      borisStep(state, period / steps, qm, [0, 0], B)
      expect(Math.abs(Math.hypot(state[2], state[3]) / v - 1)).toBeLessThan(1e-13)
      yMin = Math.min(yMin, state[1])
      yMax = Math.max(yMax, state[1])
    }
    // Boris is a leapfrog scheme: velocities sit half a step from positions, so
    // the circle's centre is shifted by ~r·ωΔt/2. Measure the radius from the
    // orbit's own extent rather than from an assumed centre.
    const r = v / (qm * B)
    expect(Math.abs((yMax - yMin) / 2 / r - 1)).toBeLessThan(1e-5)
    expect(Math.hypot(state[0], state[1]) / r).toBeLessThan(1e-5) // closes after one period 2πm/(qB)
  })

  it('E × B drift velocity E/B', () => {
    const qm = 1e7
    const B = 0.01
    const E = 100 // V/m along y
    const state = Float64Array.from([0, 0, 0, 0])
    const period = (2 * Math.PI) / (qm * B)
    for (let i = 0; i < 20 * 400; i++) borisStep(state, period / 400, qm, [0, E], B)
    expect(state[0] / (20 * period) / (E / B) - 1).toBeLessThan(1e-3)
  })
})

describe('Coulomb interactions', () => {
  it('two like charges released from rest: speed follows energy conservation', () => {
    const q = 1e-6
    const m = 0.01
    const r0 = 0.1
    const model = new NBodyModel({
      bodies: [
        { name: 'a', mass: m, charge: q, x: -r0 / 2, y: 0, vx: 0, vy: 0 },
        { name: 'b', mass: m, charge: q, x: r0 / 2, y: 0, vx: 0, vy: 0 },
      ],
      interaction: 'coulomb',
      softening: 0,
      integrator: 'rk4',
    })
    for (let i = 0; i < 20_000; i++) model.step(1e-5)
    const r = model.position(1)[0] - model.position(0)[0]
    const v = model.velocity(1)[0]
    expect(r).toBeGreaterThan(r0) // repulsion
    expect(Math.abs(v ** 2 / ((K * q * q * (1 / r0 - 1 / r)) / m) - 1)).toBeLessThan(1e-9)
  })
})

describe('electromagnetic induction', () => {
  it('analytic dΦ/dx matches a finite difference, and the EMF peaks at x = a/2', () => {
    const [m, a] = [1.5, 0.03]
    const h = 1e-7
    for (const x of [-0.05, 0.01, 0.2]) {
      const fd = (dipoleFlux(m, a, x + h) - dipoleFlux(m, a, x - h)) / (2 * h)
      expect(Math.abs(dipoleFluxGradient(m, a, x) / fd - 1)).toBeLessThan(1e-6)
    }
    const peak = [0.4, 0.45, 0.5, 0.55, 0.6].map((f) => Math.abs(inducedEmf(100, m, a, f * a, 1)))
    expect(Math.max(...peak)).toBe(peak[2])
  })

  it('the net flux change, and so ∫ε dt, is zero for a complete pass through the coil', () => {
    const [m, a, v] = [1.5, 0.03, 0.5]
    let integral = 0
    const dt = 1e-5
    let peak = 0
    for (let t = 0; t < 2; t += dt) {
      const e = inducedEmf(200, m, a, -0.5 + v * t, v)
      integral += e * dt
      peak = Math.max(peak, Math.abs(e))
    }
    expect(Math.abs(integral)).toBeLessThan(1e-4 * peak * 0.1)
  })
})

describe('circuit solver (MNA)', () => {
  const series: Circuit = {
    nodes: 4,
    elements: [
      { kind: 'voltage', id: 'V', a: 1, b: 0, voltage: 12 },
      { kind: 'resistor', id: 'R1', a: 1, b: 2, resistance: 100 },
      { kind: 'resistor', id: 'R2', a: 2, b: 3, resistance: 200 },
      { kind: 'resistor', id: 'R3', a: 3, b: 0, resistance: 300 },
    ],
  }

  it('series: I = V / ΣR, and power delivered equals power dissipated', () => {
    const s = solveCircuit(series)
    expect(s.currents.get('R1')).toBeCloseTo(12 / 600, 14)
    expect(s.currents.get('V')).toBeCloseTo(12 / 600, 14)
    const dissipated = ['R1', 'R2', 'R3'].reduce((sum, id, k) => sum + (s.currents.get(id) ?? 0) ** 2 * [100, 200, 300][k], 0)
    expect(dissipated).toBeCloseTo(12 * (s.currents.get('V') ?? 0), 14)
    for (const r of kirchhoffResiduals(series, s)) expect(Math.abs(r)).toBeLessThan(1e-15)
  })

  it('parallel: 1/R_eq = Σ 1/R', () => {
    const s = solveCircuit({
      nodes: 2,
      elements: [
        { kind: 'voltage', id: 'V', a: 1, b: 0, voltage: 9 },
        { kind: 'resistor', id: 'R1', a: 1, b: 0, resistance: 100 },
        { kind: 'resistor', id: 'R2', a: 1, b: 0, resistance: 300 },
      ],
    })
    expect(9 / (s.currents.get('V') ?? 0)).toBeCloseTo(1 / (1 / 100 + 1 / 300), 10)
  })

  it('a balanced Wheatstone bridge carries no current through the galvanometer', () => {
    const s = solveCircuit({
      nodes: 4,
      elements: [
        { kind: 'voltage', id: 'V', a: 1, b: 0, voltage: 10 },
        { kind: 'resistor', id: 'R1', a: 1, b: 2, resistance: 100 },
        { kind: 'resistor', id: 'R2', a: 2, b: 0, resistance: 200 },
        { kind: 'resistor', id: 'R3', a: 1, b: 3, resistance: 150 },
        { kind: 'resistor', id: 'R4', a: 3, b: 0, resistance: 300 },
        { kind: 'resistor', id: 'G', a: 2, b: 3, resistance: 50 },
      ],
    })
    expect(Math.abs(s.currents.get('G') ?? 1)).toBeLessThan(1e-15)
  })

  it('RC charging: backward Euler converges to V(1 − e^{−t/RC}) at first order', () => {
    const rc: Circuit = {
      nodes: 3,
      elements: [
        { kind: 'voltage', id: 'V', a: 1, b: 0, voltage: 5 },
        { kind: 'resistor', id: 'R', a: 1, b: 2, resistance: 1000 },
        { kind: 'capacitor', id: 'C', a: 2, b: 0, capacitance: 1e-3 },
      ],
    }
    const errorAt = (dt: number) => {
      const vc = new Map([['C', 0]])
      for (let t = 0; t < 1 - 1e-12; t += dt) {
        const s = solveCircuit(rc, { dt, capacitorVoltages: vc })
        vc.set('C', s.voltages[2])
      }
      return Math.abs((vc.get('C') ?? 0) - 5 * (1 - Math.exp(-1)))
    }
    const order = Math.log2(errorAt(0.01) / errorAt(0.005))
    expect(order).toBeGreaterThan(0.9)
    expect(order).toBeLessThan(1.1)
  })

  it('refuses a circuit with a floating node', () => {
    expect(() =>
      solveCircuit({ nodes: 3, elements: [{ kind: 'voltage', id: 'V', a: 1, b: 0, voltage: 1 }, { kind: 'resistor', id: 'R', a: 2, b: 2, resistance: 1 }] }),
    ).toThrow()
  })
})
