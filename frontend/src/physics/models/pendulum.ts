import { completeEllipticK } from '../analysis/elliptic'
import { hermiteRoot } from '../analysis/interpolation'
import { createStepper } from '../core/integrators'
import type { IntegratorName, MechanicalSystem, Stepper } from '../core/integrators'

export type PendulumModelKind = 'nonlinear' | 'linear'

export interface PendulumParams {
  /** Rod length, m. */
  length: number
  /** Bob mass, kg. */
  mass: number
  /** Release angle from the vertical, degrees (released from rest). */
  amplitudeDeg: number
  /** m/s² */
  gravity: number
  /** Linear drag coefficient b on the bob (force −b·v), kg/s. γ = b/m. */
  dampingCoefficient: number
  model: PendulumModelKind
  integrator: IntegratorName
}

export function smallAnglePeriod(length: number, gravity: number): number {
  return 2 * Math.PI * Math.sqrt(length / gravity)
}

/** Exact undamped period of the nonlinear pendulum: T = 4√(L/g)·K(sin(θ₀/2)). */
export function exactPeriod(length: number, gravity: number, amplitudeRad: number): number {
  return 4 * Math.sqrt(length / gravity) * completeEllipticK(Math.sin(Math.abs(amplitudeRad) / 2))
}

/** Period of the damped linear model 2π/ω_d, or NaN if not underdamped. */
export function dampedLinearPeriod(length: number, gravity: number, dampingRate: number): number {
  const wd2 = gravity / length - (dampingRate * dampingRate) / 4
  return wd2 > 0 ? (2 * Math.PI) / Math.sqrt(wd2) : Number.NaN
}

/**
 * Exact solution of the linear (small-angle) model θ'' + γθ' + ω₀²θ = 0,
 * released from rest at θ₀: under-, critically and over-damped cases.
 */
export function linearSolution(t: number, theta0: number, omega0Squared: number, gamma: number): number {
  const half = gamma / 2
  const disc = omega0Squared - half * half
  const scale = 1e-12 * Math.max(omega0Squared, half * half)
  if (disc > scale) {
    const wd = Math.sqrt(disc)
    return theta0 * Math.exp(-half * t) * (Math.cos(wd * t) + (half / wd) * Math.sin(wd * t))
  }
  if (disc < -scale) {
    const root = Math.sqrt(-disc)
    const s1 = -half + root
    const s2 = -half - root
    return (theta0 / (s1 - s2)) * (s1 * Math.exp(s2 * t) - s2 * Math.exp(s1 * t))
  }
  return theta0 * Math.exp(-half * t) * (1 + half * t)
}

function pendulumSystem(p: PendulumParams): MechanicalSystem {
  const g = p.gravity / p.length
  const gamma = p.dampingCoefficient / p.mass
  const linear = p.model === 'linear'
  return {
    dof: 1,
    acceleration(_t, q, v, a) {
      a[0] = -g * (linear ? q[0] : Math.sin(q[0])) - gamma * v[0]
    },
  }
}

/**
 * Pendulum integrated with a selectable method. The period is *measured* from
 * successive downward zero crossings of θ, timed by cubic Hermite
 * interpolation inside the step.
 */
export class PendulumModel {
  /** [θ (rad), ω (rad/s)] */
  readonly state: Float64Array
  readonly params: PendulumParams
  readonly initialEnergy: number
  time = 0
  /** Times of downward zero crossings (one per period). */
  readonly crossings: number[] = []
  private readonly stepper: Stepper
  private readonly before = new Float64Array(2)

  constructor(params: PendulumParams) {
    this.params = params
    this.state = Float64Array.from([(params.amplitudeDeg * Math.PI) / 180, 0])
    this.stepper = createStepper(params.integrator, pendulumSystem(params))
    this.initialEnergy = this.totalEnergy()
  }

  readonly finished = false

  step(dt: number): void {
    this.before.set(this.state)
    this.stepper.step(this.time, this.state, dt)
    if (this.before[0] > 0 && this.state[0] <= 0) {
      this.crossings.push(this.time + hermiteRoot(this.before[0], this.state[0], this.before[1], this.state[1], dt))
    }
    this.time += dt
  }

  /** Most recent measured period, or NaN before two crossings. */
  get measuredPeriod(): number {
    const n = this.crossings.length
    return n >= 2 ? this.crossings[n - 1] - this.crossings[n - 2] : Number.NaN
  }

  kineticEnergy(): number {
    const { mass, length } = this.params
    return 0.5 * mass * length * length * this.state[1] ** 2
  }

  /** Potential energy relative to the lowest point. The linear model's own conserved form is ½mgLθ². */
  potentialEnergy(): number {
    const { mass, gravity, length, model } = this.params
    const theta = this.state[0]
    return model === 'linear' ? 0.5 * mass * gravity * length * theta * theta : mass * gravity * length * (1 - Math.cos(theta))
  }

  totalEnergy(): number {
    return this.kineticEnergy() + this.potentialEnergy()
  }
}
