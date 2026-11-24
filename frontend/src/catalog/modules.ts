import type { ModelFidelity, ModuleId, ModuleInfo } from './types'

export const MODULES: readonly ModuleInfo[] = [
  {
    id: 'mechanics',
    title: 'Classical Mechanics',
    description: 'Motion, forces, oscillation and collisions of rigid bodies and point masses.',
  },
  {
    id: 'gravitation',
    title: 'Gravity & Orbital Mechanics',
    description: 'Newtonian gravitation between many bodies, from two-body orbits to the solar system.',
  },
  {
    id: 'waves',
    title: 'Waves & Oscillations',
    description: 'Harmonic motion, propagation, superposition, standing waves and resonance.',
  },
  {
    id: 'electromagnetism',
    title: 'Electricity & Magnetism',
    description: 'Charges, fields, induction and DC circuits.',
  },
  {
    id: 'thermodynamics',
    title: 'Thermodynamics',
    description: 'Gas kinetics, gas laws and heat transfer from microscopic and macroscopic views.',
  },
  {
    id: 'advanced',
    title: 'Advanced Topics',
    description: 'Special relativity and introductory quantum phenomena, with their model limits stated.',
  },
]

export const FIDELITY_LABELS: Record<ModelFidelity, { label: string; description: string }> = {
  numerical: {
    label: 'Numerical model',
    description:
      'Classical equations solved numerically. Accuracy is limited by the stated assumptions and the integration timestep.',
  },
  analytic: {
    label: 'Analytic model',
    description: 'Closed-form result of an established theory, evaluated directly rather than integrated.',
  },
  simplified: {
    label: 'Simplified model',
    description:
      'Educational model that captures the key relationship but deliberately omits effects listed in its model notes.',
  },
}

export function getModule(id: ModuleId): ModuleInfo {
  const found = MODULES.find((m) => m.id === id)
  if (!found) throw new Error(`Unknown module: ${id}`)
  return found
}
