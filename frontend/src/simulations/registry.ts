import { circularMotionSimulation } from './circular-motion'
import { collisionsSimulation } from './collisions'
import { gravitySimulation } from './gravity-n-body'
import { solarSystemSimulation } from './solar-system'
import { simpleHarmonicSimulation } from './simple-harmonic-motion'
import { resonanceSimulation } from './resonance'
import { wavePropagationSimulation } from './wave-propagation'
import { standingWavesSimulation } from './standing-waves'
import { soundWavesSimulation } from './sound-waves'
import { interferenceSimulation } from './interference'
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
    simpleHarmonicSimulation,
    resonanceSimulation,
    wavePropagationSimulation,
    standingWavesSimulation,
    soundWavesSimulation,
    interferenceSimulation,
  ].map((s) => [s.id, s]),
)
