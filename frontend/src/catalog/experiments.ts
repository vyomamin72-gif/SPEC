import type { ExperimentInfo } from './types'

const available = { status: 'available' } as const
const phase3 = { status: 'planned', phase: 'Phase 3' } as const
const phase5 = { status: 'planned', phase: 'Phase 5' } as const
const later = { status: 'planned', phase: 'After MVP' } as const

/**
 * Registry of every experiment in the laboratory.
 *
 * An experiment is marked `available` only when its simulation is implemented
 * and its physics tests pass. Everything else is shown to users as planned.
 */
export const EXPERIMENTS: readonly ExperimentInfo[] = [
  // ── Module A: Classical mechanics ──────────────────────────────────────
  {
    id: 'projectile-motion',
    title: 'Projectile Motion',
    module: 'mechanics',
    summary: 'Launch a body under uniform gravity; measure range, peak height and flight time, with optional air drag.',
    fidelity: 'numerical',
    modelNotes:
      'Uniform gravity over flat, non-rotating ground. Optional drag uses a constant coefficient; spin (Magnus force) and wind are not modelled.',
    availability: available,
  },
  {
    id: 'newtons-laws',
    title: "Newton's Laws",
    module: 'mechanics',
    summary: 'Apply forces to blocks with static and kinetic friction, and study a table-and-pulley system with free-body diagrams.',
    fidelity: 'numerical',
    modelNotes:
      'Rigid blocks, Coulomb friction with distinct static and kinetic coefficients, ideal massless string and frictionless pulley.',
    availability: available,
  },
  {
    id: 'pendulum',
    title: 'Pendulum',
    module: 'mechanics',
    summary: 'Compare the simple (small-angle) and full nonlinear pendulum, measure the period and track energy.',
    fidelity: 'numerical',
    modelNotes:
      'Point mass on a massless rigid rod in uniform gravity. Damping is a linear drag force on the bob. Large amplitudes are handled exactly by the nonlinear mode.',
    availability: available,
  },
  {
    id: 'collisions',
    title: 'Collision Laboratory',
    module: 'mechanics',
    summary: 'Collide bodies on a track with adjustable restitution and verify conservation of momentum.',
    fidelity: 'numerical',
    modelNotes:
      'One-dimensional frictionless track. Collisions are instantaneous and described by a coefficient of restitution; contact deformation is not modelled.',
    availability: phase3,
  },
  {
    id: 'circular-motion',
    title: 'Circular Motion',
    module: 'mechanics',
    summary: 'Relate angular velocity, radius, centripetal acceleration and the tension needed to keep a body on a circle.',
    fidelity: 'numerical',
    modelNotes: 'Point mass on an ideal inextensible tether on a frictionless horizontal plane.',
    availability: phase5,
  },

  // ── Module B: Gravity and orbital mechanics ───────────────────────────
  {
    id: 'gravity-n-body',
    title: 'Gravity Simulator',
    module: 'gravitation',
    summary: 'Two-body and many-body Newtonian gravity with force vectors and orbital trajectories.',
    fidelity: 'numerical',
    modelNotes:
      'Newtonian point masses. Forces are softened below a small length to avoid numerical singularities; this softening is not a property of nature.',
    availability: phase5,
  },
  {
    id: 'solar-system',
    title: 'Solar System',
    module: 'gravitation',
    summary: 'The Sun and planets integrated as an N-body system with adjustable time speed and initial conditions.',
    fidelity: 'numerical',
    modelNotes:
      'Newtonian N-body from approximate mean orbital elements. No general relativity, moons or asteroids, so it drifts from real ephemerides over long times.',
    availability: phase5,
  },

  // ── Module C: Waves and oscillations ──────────────────────────────────
  {
    id: 'simple-harmonic-motion',
    title: 'Simple Harmonic Motion',
    module: 'waves',
    summary: 'A mass on an ideal spring compared against its exact sinusoidal solution.',
    fidelity: 'numerical',
    modelNotes: 'Ideal massless linear spring obeying Hooke’s law; optional linear damping.',
    availability: phase5,
  },
  {
    id: 'wave-propagation',
    title: 'Wave Propagation',
    module: 'waves',
    summary: 'Pulses and wave trains travelling along a string, with reflection at fixed and free ends.',
    fidelity: 'numerical',
    modelNotes: 'Linear wave equation on a discretised string, valid for small transverse displacements.',
    availability: phase5,
  },
  {
    id: 'standing-waves',
    title: 'Standing Waves',
    module: 'waves',
    summary: 'Excite normal modes of a string and compare their frequencies with fₙ = n·v / 2L.',
    fidelity: 'numerical',
    modelNotes: 'Linear wave equation, uniform string, ideal fixed boundaries.',
    availability: phase5,
  },
  {
    id: 'interference',
    title: 'Interference Patterns',
    module: 'waves',
    summary: 'Two-source interference with adjustable wavelength, separation and phase difference.',
    fidelity: 'analytic',
    modelNotes: 'Exact superposition of ideal point sources of linear waves; amplitude decay with distance is optional.',
    availability: phase5,
  },
  {
    id: 'sound-waves',
    title: 'Sound Waves',
    module: 'waves',
    summary: 'Visualise air-parcel displacement and pressure in a longitudinal sound wave.',
    fidelity: 'simplified',
    modelNotes: 'Linear one-dimensional acoustics in a uniform medium; no attenuation or nonlinear effects.',
    availability: phase5,
  },
  {
    id: 'resonance',
    title: 'Resonance',
    module: 'waves',
    summary: 'Drive a damped oscillator and map amplitude and phase against driving frequency.',
    fidelity: 'numerical',
    modelNotes: 'Linear damped driven oscillator with sinusoidal forcing.',
    availability: phase5,
  },

  // ── Module D: Electricity and magnetism ───────────────────────────────
  {
    id: 'coulomb-interactions',
    title: 'Charge Interactions',
    module: 'electromagnetism',
    summary: 'Point charges moving under Coulomb forces, with force vectors and momentum tracking.',
    fidelity: 'numerical',
    modelNotes:
      'Non-relativistic point charges: magnetic interaction and radiation are neglected. Forces are softened at very short range.',
    availability: phase5,
  },
  {
    id: 'electric-field',
    title: 'Electric Field',
    module: 'electromagnetism',
    summary: 'Field vectors and field lines for arrangements of static charges.',
    fidelity: 'analytic',
    modelNotes: 'Superposition of static point-charge fields; field lines are traced numerically.',
    availability: phase5,
  },
  {
    id: 'magnetic-field',
    title: 'Magnetic Field',
    module: 'electromagnetism',
    summary: 'Fields of straight wires and current loops.',
    fidelity: 'analytic',
    modelNotes: 'Steady currents in thin conductors (Biot–Savart law).',
    availability: phase5,
  },
  {
    id: 'electromagnetic-induction',
    title: 'Electromagnetic Induction',
    module: 'electromagnetism',
    summary: 'Move a magnet through a coil and observe the induced EMF from the changing flux.',
    fidelity: 'simplified',
    modelNotes: 'Faraday’s law for a magnetic dipole and a coil. The coil’s self-inductance and the force on the magnet are neglected.',
    availability: phase5,
  },
  {
    id: 'dc-circuits',
    title: 'DC Circuits',
    module: 'electromagnetism',
    summary: 'Build series and parallel resistor circuits and measure voltage and current.',
    fidelity: 'numerical',
    modelNotes: 'Lumped ideal components (sources, resistors, wires) solved by nodal analysis.',
    availability: phase5,
  },

  // ── Module E: Thermodynamics ──────────────────────────────────────────
  {
    id: 'ideal-gas',
    title: 'Gas Kinetics',
    module: 'thermodynamics',
    summary: 'A gas of colliding particles: relate temperature, pressure and volume to particle motion.',
    fidelity: 'numerical',
    modelNotes:
      'Two-dimensional hard-disk molecular dynamics — a real Newtonian simulation of a 2D analogue gas. It departs from the ideal-gas law at high density, and the lab shows by how much.',
    availability: phase5,
  },
  {
    id: 'heat-transfer',
    title: 'Heat Conduction',
    module: 'thermodynamics',
    summary: 'Temperature profiles evolving along a rod with fixed-temperature ends.',
    fidelity: 'numerical',
    modelNotes: 'One-dimensional heat equation (Fourier’s law) with constant material properties.',
    availability: phase5,
  },

  // ── Module F: Advanced experiments ────────────────────────────────────
  {
    id: 'time-dilation',
    title: 'Time Dilation',
    module: 'advanced',
    summary: 'Light clocks and spacetime diagrams for observers in relative motion.',
    fidelity: 'analytic',
    modelNotes: 'Lorentz transformations of special relativity (no gravity). Experimentally confirmed, e.g. by muon lifetimes.',
    availability: later,
  },
  {
    id: 'length-contraction',
    title: 'Length Contraction',
    module: 'advanced',
    summary: 'Measured lengths of moving objects along the direction of motion.',
    fidelity: 'analytic',
    modelNotes:
      'Special relativity. Shows the measured length; what a camera would actually see differs because of light-travel time (Terrell–Penrose rotation).',
    availability: later,
  },
  {
    id: 'double-slit',
    title: 'Double-Slit Experiment',
    module: 'advanced',
    summary: 'Single-particle detections accumulating into an interference pattern.',
    fidelity: 'analytic',
    modelNotes:
      'Detections are sampled from the analytic far-field (Fraunhofer) probability distribution. The wavefunction itself is not evolved in time.',
    availability: later,
  },
  {
    id: 'quantum-probability',
    title: 'Quantum Probability',
    module: 'advanced',
    summary: 'Probability densities of stationary states of a particle in a box.',
    fidelity: 'analytic',
    modelNotes: 'Infinite square well in one dimension; an idealisation of a real confining potential.',
    availability: later,
  },
  {
    id: 'photoelectric-effect',
    title: 'Photoelectric Effect',
    module: 'advanced',
    summary: 'Stopping potential and photocurrent versus light frequency and intensity.',
    fidelity: 'simplified',
    modelNotes:
      'The threshold law K_max = hf − φ is experimentally validated; the electron energy spread and collection efficiency are simplified assumptions.',
    availability: later,
  },
]

export function findExperiment(id: string): ExperimentInfo | undefined {
  return EXPERIMENTS.find((e) => e.id === id)
}
