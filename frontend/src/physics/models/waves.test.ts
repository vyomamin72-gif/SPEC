import { describe, expect, it } from 'vitest'
import { screenMaxima } from './interference'
import { exactDisplacement, OscillatorModel, steadyAmplitude } from './oscillator'
import type { OscillatorParams } from './oscillator'
import { gridModeFrequency, modeFrequency, WaveString } from './waveString'
import type { WaveStringParams } from './waveString'

const osc = (o: Partial<OscillatorParams> = {}): OscillatorParams => ({
  mass: 0.5, stiffness: 20, damping: 0.3, initialDisplacement: 0.1, driveAmplitude: 0, driveFrequency: 5, integrator: 'rk4', ...o,
})

describe('OscillatorModel', () => {
  it.each([
    ['free, damped', osc()],
    ['driven from rest', osc({ initialDisplacement: 0, driveAmplitude: 1, driveFrequency: 5.5 })],
  ])('RK4 matches the exact solution (%s)', (_name, p) => {
    const model = new OscillatorModel(p)
    let maxError = 0
    for (let i = 1; i <= 20_000; i++) {
      model.step(1e-3)
      maxError = Math.max(maxError, Math.abs(model.state[0] - exactDisplacement(p, i * 1e-3)))
    }
    expect(maxError).toBeLessThan(1e-9)
  })

  it('measures the free period 2π√(m/k) without damping', () => {
    const model = new OscillatorModel(osc({ damping: 0 }))
    for (let i = 0; i < 10_000; i++) model.step(1e-3)
    expect(model.measuredPeriod / (2 * Math.PI * Math.sqrt(0.5 / 20)) - 1).toBeLessThan(1e-9)
  })

  it('settles to the steady-state amplitude of the resonance curve', () => {
    for (const w of [3, 6.2, 9]) {
      const p = osc({ initialDisplacement: 0, driveAmplitude: 1, driveFrequency: w })
      const model = new OscillatorModel(p)
      for (let i = 0; i < 80_000; i++) model.step(1e-3)
      // Peak sampled at step points: relative error ≲ (ωΔt)²/8 ≈ 5e-6.
      expect(Math.abs(model.settledAmplitude / steadyAmplitude(p, w) - 1)).toBeLessThan(1e-4)
    }
  })
})

const string = (o: Partial<WaveStringParams> = {}): WaveStringParams => ({
  length: 10, cells: 400, waveSpeed: 5, courant: 1, damping: 0, left: 'fixed', right: 'fixed', ...o,
})
const pulse = (x0: number, width = 0.3) => (x: number) => Math.exp(-(((x - x0) / width) ** 2))

describe('WaveString', () => {
  it('at Courant number 1 reproduces d’Alembert’s solution exactly: two half-pulses moving at ±c', () => {
    const s = new WaveString(string({ initial: pulse(5) }))
    const f = pulse(5)
    for (let n = 0; n < 100; n++) s.step()
    for (let i = 0; i < s.n; i++) {
      const exact = 0.5 * (f(s.x[i] - 5 * s.time) + f(s.x[i] + 5 * s.time))
      expect(Math.abs(s.u[i] - exact)).toBeLessThan(1e-12)
    }
  })

  it('reflects inverted from a fixed end and upright from a free end', () => {
    for (const [right, sign] of [['fixed', -1], ['free', 1]] as const) {
      const s = new WaveString(string({ right, left: 'open', initial: pulse(7) }))
      while (s.time < 1.5) s.step() // right-moving half reflects at x = 10 by t = 0.6 s; left half leaves via the open end
      const extreme = s.u.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0)
      expect(Math.sign(extreme)).toBe(sign)
      expect(Math.abs(extreme)).toBeCloseTo(0.5, 6)
    }
  })

  it('the open (absorbing) end lets a pulse leave with under 1 % reflected at C = 0.9', () => {
    const s = new WaveString(string({ courant: 0.9, left: 'open', right: 'open', initial: pulse(5) }))
    while (s.time < 2) s.step()
    expect(Math.max(...Array.from(s.u, Math.abs))).toBeLessThan(0.005)
  })

  it('mode frequencies follow the grid dispersion relation exactly and the continuum within O((kΔx)²)', () => {
    const L = 10
    const n = 3
    const s = new WaveString(string({ courant: 0.8, cells: 200, initial: (x) => Math.sin((n * Math.PI * x) / L) }))
    const probe = Math.round(s.n / (2 * n)) // an antinode
    const crossings: number[] = []
    let last = s.u[probe]
    while (s.time < 20) {
      s.step()
      const now = s.u[probe]
      if (last > 0 && now <= 0) crossings.push(s.time - s.dt * (now / (now - last)))
      last = now
    }
    const measured = (crossings.length - 1) / (crossings[crossings.length - 1] - crossings[0])
    expect(Math.abs(measured / gridModeFrequency(n, s) - 1)).toBeLessThan(1e-5)
    const continuum = modeFrequency(n, 5, L)
    expect(Math.abs(measured / continuum - 1)).toBeLessThan(2e-3)
    expect(measured).toBeLessThan(continuum) // numerical dispersion lowers the frequency for C < 1
  })

  it('is unstable above the CFL limit', () => {
    const s = new WaveString(string({ courant: 1.05, initial: pulse(5) }))
    for (let i = 0; i < 400; i++) s.step()
    expect(Math.max(...Array.from(s.u, Math.abs))).toBeGreaterThan(1e3)
  })
})

describe('two-source interference', () => {
  it('fringe spacing on a distant screen approaches λD/d (far-field limit)', () => {
    // λD/d = 0.2 m, so the ±0.65 m window holds the central maximum and three on each side (|θ| ≤ 0.16 rad).
    const p = { wavelength: 0.01, separation: 0.2, phaseDifference: 0, decay: false, waveSpeed: 0.2 }
    const D = 4
    const maxima = screenMaxima(p, D, 0.65)
    expect(maxima).toHaveLength(7)
    const central = maxima.reduce((best, y) => (Math.abs(y) < Math.abs(best) ? y : best))
    expect(Math.abs(central)).toBeLessThan(1e-9) // in phase: central maximum on the axis
    const spacing = (maxima[maxima.length - 1] - maxima[0]) / (maxima.length - 1)
    // λD/d is a small-angle, far-field formula: the exact maxima sit at D·tan θₘ with
    // sin θₘ = mλ/d, about 1 % further out at θ ≈ 0.15 rad. A model approximation, not a numerical error.
    expect(Math.abs(spacing / ((p.wavelength * D) / p.separation) - 1)).toBeLessThan(0.02)
  })

  it('a half-wavelength phase difference puts a minimum on the axis', () => {
    const p = { wavelength: 0.01, separation: 0.05, phaseDifference: Math.PI, decay: false, waveSpeed: 0.2 }
    const maxima = screenMaxima(p, 2, 0.05)
    expect(Math.min(...maxima.map(Math.abs))).toBeGreaterThan(0.1)
  })
})
