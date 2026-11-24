import { describe, expect, it } from 'vitest'
import { dragFreeTheory } from '@/physics/models/projectile'
import { SimulationController } from './controller'
import { SIMULATIONS } from './registry'
import { defaultValues } from './types'

const readout = (c: SimulationController, label: string) =>
  c.getSnapshot().readouts.flatMap((g) => g.items).find((i) => i.label === label)

describe('SimulationController', () => {
  it('steps one fixed timestep at a time and resets', () => {
    const c = new SimulationController(SIMULATIONS['pendulum'])
    c.step()
    c.step()
    expect(c.getSnapshot().time).toBeCloseTo(2e-3, 15)
    c.reset()
    expect(c.getSnapshot().time).toBe(0)
  })

  it('rebuilds on ordinary parameter changes and notifies subscribers', () => {
    const c = new SimulationController(SIMULATIONS['projectile-motion'])
    let notified = 0
    c.subscribe(() => notified++)
    c.step()
    c.setParameter('angleDeg', 30)
    expect(notified).toBeGreaterThan(0)
    expect(c.getSnapshot().time).toBe(0)
    expect(c.getSnapshot().values.angleDeg).toBe(30)
    expect(readout(c, 'Range (theory)')?.value).toBeCloseTo(dragFreeTheory(20, Math.PI / 6, 0, 9.80665).range, 12)
  })

  it('applies live parameters without resetting', () => {
    const c = new SimulationController(SIMULATIONS['newtons-laws'])
    for (let i = 0; i < 100; i++) c.step()
    c.setParameter('appliedForce', 0)
    expect(c.getSnapshot().time).toBeCloseTo(0.1, 12)
    expect(readout(c, 'Applied force F')?.value).toBe(0)
  })

  it('records on the simulation-time schedule, pauses, clears and exports CSV', () => {
    const c = new SimulationController(SIMULATIONS['pendulum'])
    for (let i = 0; i < 1000; i++) c.step() // 1 s at dt = 1 ms, sampled every 10 ms
    expect(c.getSnapshot().sampleCount).toBe(101)
    c.setRecordingPaused(true)
    for (let i = 0; i < 100; i++) c.step()
    expect(c.getSnapshot().sampleCount).toBe(101)
    const csv = c.toCsv().trim().split('\n')
    expect(csv[0]).toBe('t (s),θ (°),"θ, small-angle exact solution (°)",ω (rad/s),Kinetic energy (J),Potential energy (J),Total energy (J)')
    expect(csv).toHaveLength(102)
    c.clearRecording()
    expect(c.getSnapshot().sampleCount).toBe(0)
  })

  it('drag-free projectile: recorded trajectory equals its theory curve, and the landing is recorded', () => {
    const c = new SimulationController(SIMULATIONS['projectile-motion'])
    while (!c.getSnapshot().finished) c.step()
    const chart = SIMULATIONS['projectile-motion'].charts[0]
    const [times, x, y, xTheory, yTheory] = c.chartData(chart)
    for (let i = 0; i < times.length; i++) {
      expect(Math.abs((x[i] ?? NaN) - (xTheory[i] ?? NaN))).toBeLessThan(1e-9)
      expect(Math.abs((y[i] ?? NaN) - (yTheory[i] ?? NaN))).toBeLessThan(1e-9)
    }
    expect(times.at(-1)).toBeCloseTo(c.getSnapshot().time, 15)
    expect(y.at(-1)).toBe(0)
  })

  it('Newton theory curve stops applying once the force is changed mid-run', () => {
    const c = new SimulationController(SIMULATIONS['newtons-laws'])
    for (let i = 0; i < 500; i++) c.step()
    c.setParameter('appliedForce', 0)
    for (let i = 0; i < 100; i++) c.step()
    const [, x, xTheory] = c.chartData(SIMULATIONS['newtons-laws'].charts[0])
    expect(Math.abs((x[10] ?? NaN) - (xTheory[10] ?? NaN))).toBeLessThan(1e-12)
    expect(xTheory.at(-1)).toBeNull()
  })

  it('sound lab: once the tube is filled, measured wavelength and pressure amplitude match theory', () => {
    const c = new SimulationController(SIMULATIONS['sound-waves'])
    // Fill time: L/c (5.8 ms) + ramp (6 ms) + two periods (4 ms) ≈ 16 ms.
    while (c.getSnapshot().time < 0.02) for (let i = 0; i < 100; i++) c.step()
    const wavelength = readout(c, 'Wavelength (measured from pressure)')?.value ?? NaN
    expect(Math.abs(wavelength / (343 / 500) - 1)).toBeLessThan(0.01)
    const pMax = readout(c, 'Largest pressure in the tube now')?.value ?? NaN
    const pTheory = readout(c, 'Pressure amplitude ρcωs₀ (travelling wave)')?.value ?? NaN
    expect(Math.abs(pMax / pTheory - 1)).toBeLessThan(0.02)
  })

  it('every chart series refers to a declared channel', () => {
    for (const d of Object.values(SIMULATIONS)) {
      const keys = new Set(d.channels.map((ch) => ch.key))
      for (const chart of d.charts) for (const s of chart.series) expect(keys.has(s.key), `${d.id}:${s.key}`).toBe(true)
      expect(new Set(d.channels.map((ch) => ch.key)).size).toBe(d.channels.length)
    }
  })

  it('every registered simulation builds, steps and reports finite readouts with defaults', () => {
    for (const definition of Object.values(SIMULATIONS)) {
      const c = new SimulationController(definition, defaultValues(definition))
      for (let i = 0; i < 50; i++) c.step()
      expect(definition.create(defaultValues(definition)).sample()).toHaveLength(definition.channels.length)
      const items = c.getSnapshot().readouts.flatMap((g) => g.items)
      expect(items.length).toBeGreaterThan(3)
      expect(items.some((i) => typeof i.value === 'number' && Number.isFinite(i.value))).toBe(true)
    }
  })
})
