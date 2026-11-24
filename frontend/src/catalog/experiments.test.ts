import { describe, expect, it } from 'vitest'
import { EXPERIMENTS, findExperiment } from './experiments'
import { MODULES, getModule } from './modules'
import { SIMULATION_LOADERS } from '@/simulations/loaders'
import { SIMULATIONS } from '@/simulations/registry'

describe('experiment catalog', () => {
  it('has unique, URL-safe ids', () => {
    const ids = EXPERIMENTS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('assigns every experiment to a known module and every module has experiments', () => {
    const moduleIds = new Set(MODULES.map((m) => m.id))
    for (const e of EXPERIMENTS) expect(moduleIds.has(e.module)).toBe(true)
    for (const m of MODULES) expect(EXPERIMENTS.some((e) => e.module === m.id)).toBe(true)
  })

  it('documents the model assumptions of every experiment', () => {
    for (const e of EXPERIMENTS) {
      expect(e.summary.length).toBeGreaterThan(20)
      expect(e.modelNotes.length).toBeGreaterThan(20)
    }
  })

  it('marks an experiment available if and only if its simulation is implemented', () => {
    const available = EXPERIMENTS.filter((e) => e.availability.status === 'available').map((e) => e.id)
    expect(available.sort()).toEqual(Object.keys(SIMULATIONS).sort())
    expect(Object.keys(SIMULATION_LOADERS).sort()).toEqual(Object.keys(SIMULATIONS).sort())
  })

  it('looks up experiments and modules by id', () => {
    expect(findExperiment('pendulum')?.title).toBe('Pendulum')
    expect(findExperiment('does-not-exist')).toBeUndefined()
    expect(getModule('waves').title).toMatch(/Waves/)
    // @ts-expect-error – deliberately invalid id
    expect(() => getModule('alchemy')).toThrow()
  })
})
