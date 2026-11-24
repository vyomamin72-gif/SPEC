import { circularMotionSimulation } from './circular-motion'
import { collisionsSimulation } from './collisions'
import { gravitySimulation } from './gravity-n-body'
import { solarSystemSimulation } from './solar-system'
import { newtonsLawsSimulation } from './newtons-laws'
import { pendulumSimulation } from './pendulum'
import { projectileSimulation } from './projectile'
import type { SimulationDefinition } from './types'

/** Every implemented simulation, keyed by experiment id (must match the catalog). */
export const SIMULATIONS: Readonly<Record<string, SimulationDefinition>> = Object.fromEntries(
  [
    projectileSimulation,
    pendulumSimulation,
    newtonsLawsSimulation,
    collisionsSimulation,
    circularMotionSimulation,
    gravitySimulation,
    solarSystemSimulation,
  ].map((s) => [s.id, s]),
)
