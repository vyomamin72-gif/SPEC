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

  it('every registered simulation builds, steps and reports finite readouts with defaults', () => {
    for (const definition of Object.values(SIMULATIONS)) {
      const c = new SimulationController(definition, defaultValues(definition))
      for (let i = 0; i < 50; i++) c.step()
      const items = c.getSnapshot().readouts.flatMap((g) => g.items)
      expect(items.length).toBeGreaterThan(3)
      expect(items.some((i) => typeof i.value === 'number' && Number.isFinite(i.value))).toBe(true)
    }
  })
})
