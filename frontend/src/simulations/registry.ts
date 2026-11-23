import { newtonsLawsSimulation } from './newtons-laws'
import { pendulumSimulation } from './pendulum'
import { projectileSimulation } from './projectile'
import type { SimulationDefinition } from './types'

/** Every implemented simulation, keyed by experiment id (must match the catalog). */
export const SIMULATIONS: Readonly<Record<string, SimulationDefinition>> = Object.fromEntries(
  [projectileSimulation, pendulumSimulation, newtonsLawsSimulation].map((s) => [s.id, s]),
)
