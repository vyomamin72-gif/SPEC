import { circularMotionSimulation } from './circular-motion'
import { coulombSimulation } from './coulomb-interactions'
import { electricFieldSimulation } from './electric-field'
import { magneticFieldSimulation } from './magnetic-field'
import { inductionSimulation } from './electromagnetic-induction'
import { dcCircuitsSimulation } from './dc-circuits'
import { collisionsSimulation } from './collisions'
import { gravitySimulation } from './gravity-n-body'
import { idealGasSimulation } from './ideal-gas'
import { heatTransferSimulation } from './heat-transfer'
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
    coulombSimulation,
    electricFieldSimulation,
    magneticFieldSimulation,
    inductionSimulation,
    dcCircuitsSimulation,
    idealGasSimulation,
    heatTransferSimulation,
  ].map((s) => [s.id, s]),
)
