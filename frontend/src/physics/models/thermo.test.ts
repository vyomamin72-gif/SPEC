import { describe, expect, it } from 'vitest'
import { ARGON_DIAMETER, ARGON_MASS, BOLTZMANN, GasModel, hendersonCompressibility, idealPressure2D, packingFraction } from './gas'
import { ftcsModeFactor, HeatRod } from './heat'

describe('GasModel (2D hard disks)', () => {
  const params = { count: 200, boxSize: 20e-9, mass: ARGON_MASS, diameter: ARGON_DIAMETER, temperature: 300, seed: 7 }
  const dt = 0.1e-12 // ~0.1 diameters per step at thermal speeds

  it('conserves kinetic energy exactly through collisions and wall bounces', () => {
    const gas = new GasModel(params)
    const k0 = gas.kineticEnergy()
    for (let i = 0; i < 5000; i++) gas.step(dt)
    expect(gas.collisions).toBeGreaterThan(1000)
    expect(Math.abs(gas.kineticEnergy() / k0 - 1)).toBeLessThan(1e-12)
    expect(gas.temperature()).toBeCloseTo(300, 9)
  })

  it('relaxes to the 2D Maxwell–Boltzmann distribution and its pressure obeys the hard-disk equation of state', () => {
    const gas = new GasModel(params, 1e-9)
    for (let i = 0; i < 3000; i++) gas.step(dt) // thermalise (~25 collision times)
    // Statistics: average pressure over 20 windows of 1 ns, and speeds over many snapshots.
    let pressureSum = 0
    let windows = 0
    let speedSum = 0
    let speedSquares = 0
    let speedCount = 0
    let lastPressure = gas.pressure
    for (let i = 0; i < 200_000; i++) {
      gas.step(dt)
      if (Number.isFinite(gas.pressure) && gas.pressure !== lastPressure) {
        pressureSum += gas.pressure
        windows++
        lastPressure = gas.pressure
      }
      if (i % 1000 === 0) {
        for (const v of gas.speeds()) {
          speedSum += v
          speedSquares += v * v
          speedCount++
        }
      }
    }
    const kT = BOLTZMANN * 300
    // 2D Maxwell–Boltzmann: ⟨v⟩ = √(πkT / 2m), ⟨v²⟩ = 2kT/m. The initial state
    // had every particle at the same speed, so agreement shows thermalisation.
    expect(Math.abs(speedSum / speedCount / Math.sqrt((Math.PI * kT) / (2 * ARGON_MASS)) - 1)).toBeLessThan(0.02)
    expect(Math.abs(speedSquares / speedCount / ((2 * kT) / ARGON_MASS) - 1)).toBeLessThan(1e-9)
    const eta = packingFraction(200, ARGON_DIAMETER, 400e-18)
    const Z = pressureSum / windows / idealPressure2D(200, 300, 400e-18)
    // Tolerance: ±3 % covers the statistical error of 20 windows with 200 particles (~1 %)
    // plus the small bias of the time-stepped overlap correction.
    expect(Math.abs(Z / hendersonCompressibility(eta) - 1)).toBeLessThan(0.03)
    expect(Z).toBeGreaterThan(1) // excluded area raises the pressure above the ideal-gas value
  }, 60_000)

  it('refuses an impossible packing', () => {
    expect(() => new GasModel({ ...params, count: 5000 })).toThrow(RangeError)
  })
})

describe('HeatRod (FTCS)', () => {
  const base = { length: 1, cells: 50, diffusivity: 1e-4, conductivity: 400, leftTemperature: 0, rightTemperature: 0, r: 0.4 }

  it('a sine mode decays by exactly the scheme’s factor per step, and close to e^{−α(π/L)²t}', () => {
    const rod = new HeatRod({ ...base, initial: (x) => 100 * Math.sin(Math.PI * x) })
    const steps = 500
    for (let i = 0; i < steps; i++) rod.step()
    const mid = Math.round((rod.n - 1) / 2)
    expect(Math.abs(rod.T[mid] / (100 * ftcsModeFactor(1, 0.4, rod.dx, 1) ** steps) - 1)).toBeLessThan(1e-12)
    const continuum = 100 * Math.exp(-1e-4 * Math.PI ** 2 * rod.time)
    expect(Math.abs(rod.T[mid] / continuum - 1)).toBeLessThan(1e-3) // O(Δx²) spatial error
  })

  it('approaches the linear steady state between fixed end temperatures', () => {
    const rod = new HeatRod({ ...base, leftTemperature: 100, rightTemperature: 20, initial: () => 20 })
    // Slowest mode decays as e^{−t/τ}, τ = L²/(π²α); its initial amplitude is ~50 K, so wait 8τ.
    while (rod.time < 8 * (1 / (Math.PI ** 2 * 1e-4))) rod.step()
    for (let i = 0; i < rod.n; i++) expect(Math.abs(rod.T[i] - rod.steadyState(rod.x[i]))).toBeLessThan(0.1)
    expect(rod.leftFlux()).toBeCloseTo(400 * 80, -2) // k ΔT / L
  })

  it('is unstable above r = ½', () => {
    const rod = new HeatRod({ ...base, r: 0.55, initial: (x) => (x > 0.5 ? 1 : 0) })
    for (let i = 0; i < 300; i++) rod.step()
    expect(Math.max(...Array.from(rod.T, Math.abs))).toBeGreaterThan(1e3)
  })
})
