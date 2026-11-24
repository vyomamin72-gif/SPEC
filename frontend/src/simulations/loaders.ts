import type { SimulationDefinition } from './types'

/**
 * Code-split loaders: each laboratory's physics and drawing code is a
 * separate chunk, downloaded only when that laboratory is opened.
 */
export const SIMULATION_LOADERS: Readonly<Record<string, () => Promise<SimulationDefinition>>> = {
  'circular-motion': () => import('./circular-motion').then((m) => m.circularMotionSimulation),
  'coulomb-interactions': () => import('./coulomb-interactions').then((m) => m.coulombSimulation),
  'electric-field': () => import('./electric-field').then((m) => m.electricFieldSimulation),
  'magnetic-field': () => import('./magnetic-field').then((m) => m.magneticFieldSimulation),
  'electromagnetic-induction': () => import('./electromagnetic-induction').then((m) => m.inductionSimulation),
  'dc-circuits': () => import('./dc-circuits').then((m) => m.dcCircuitsSimulation),
  'collisions': () => import('./collisions').then((m) => m.collisionsSimulation),
  'gravity-n-body': () => import('./gravity-n-body').then((m) => m.gravitySimulation),
  'ideal-gas': () => import('./ideal-gas').then((m) => m.idealGasSimulation),
  'heat-transfer': () => import('./heat-transfer').then((m) => m.heatTransferSimulation),
  'solar-system': () => import('./solar-system').then((m) => m.solarSystemSimulation),
  'simple-harmonic-motion': () => import('./simple-harmonic-motion').then((m) => m.simpleHarmonicSimulation),
  'resonance': () => import('./resonance').then((m) => m.resonanceSimulation),
  'wave-propagation': () => import('./wave-propagation').then((m) => m.wavePropagationSimulation),
  'standing-waves': () => import('./standing-waves').then((m) => m.standingWavesSimulation),
  'sound-waves': () => import('./sound-waves').then((m) => m.soundWavesSimulation),
  'interference': () => import('./interference').then((m) => m.interferenceSimulation),
  'newtons-laws': () => import('./newtons-laws').then((m) => m.newtonsLawsSimulation),
  'pendulum': () => import('./pendulum').then((m) => m.pendulumSimulation),
  'projectile-motion': () => import('./projectile').then((m) => m.projectileSimulation),
}

const cache = new Map<string, Promise<SimulationDefinition>>()

/** One shared promise per laboratory, so React's use() sees a stable value. */
export function loadSimulation(id: string): Promise<SimulationDefinition> | undefined {
  const loader = SIMULATION_LOADERS[id]
  if (!loader) return undefined
  let promise = cache.get(id)
  if (!promise) {
    promise = loader()
    cache.set(id, promise)
  }
  return promise
}
