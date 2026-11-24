import { hermiteRoot } from '../analysis/interpolation'
import { createStepper } from '../core/integrators'
import type { IntegratorName, Stepper } from '../core/integrators'

export interface OscillatorParams {
  /** kg */
  mass: number
  /** Spring constant, N/m. */
  stiffness: number
  /** Linear damping coefficient b (force −b·v), kg/s. */
  damping: number
  /** Initial displacement, m (released from rest). */
  initialDisplacement: number
  /** Driving force amplitude F₀, N (0 = free oscillation). */
  driveAmplitude: number
  /** Driving angular frequency ω, rad/s. */
  driveFrequency: number
  integrator: IntegratorName
}

/** Steady-state amplitude of m x'' + b x' + k x = F₀ cos ωt: (F₀/m) / √((ω₀² − ω²)² + (γω)²). */
export function steadyAmplitude(p: Pick<OscillatorParams, 'mass' | 'stiffness' | 'damping' | 'driveAmplitude'>, omega: number): number {
  const w02 = p.stiffness / p.mass
  const gamma = p.damping / p.mass
  return p.driveAmplitude / p.mass / Math.sqrt((w02 - omega * omega) ** 2 + (gamma * omega) ** 2)
}

/** Phase lag δ of the response behind the drive, 0…π. */
export function phaseLag(p: Pick<OscillatorParams, 'mass' | 'stiffness' | 'damping'>, omega: number): number {
  return Math.atan2((p.damping / p.mass) * omega, p.stiffness / p.mass - omega * omega)
}

/**
 * Exact solution for the underdamped case with x(0) = x₀, v(0) = 0:
 * the steady-state response A cos(ωt − δ) plus the decaying transient that
 * makes the initial conditions hold. NaN if not underdamped.
 */
export function exactDisplacement(p: OscillatorParams, t: number): number {
  const w02 = p.stiffness / p.mass
  const gamma = p.damping / p.mass
  const wd2 = w02 - (gamma * gamma) / 4
  if (wd2 <= 0) return Number.NaN
  const wd = Math.sqrt(wd2)
  const w = p.driveFrequency
  const A = p.driveAmplitude === 0 ? 0 : steadyAmplitude(p, w)
  const delta = phaseLag(p, w)
  const c1 = p.initialDisplacement - A * Math.cos(delta)
  const c2 = ((gamma / 2) * c1 - A * w * Math.sin(delta)) / wd
  return A * Math.cos(w * t - delta) + Math.exp((-gamma * t) / 2) * (c1 * Math.cos(wd * t) + c2 * Math.sin(wd * t))
}

/** Mass on a linear spring with damping and an optional sinusoidal driving force. */
export class OscillatorModel {
  /** [x (m), v (m/s)] */
  readonly state: Float64Array
  readonly initialEnergy: number
  time = 0
  /** Downward zero crossings of x. */
  readonly crossings: number[] = []
  /** Largest |x| in each completed drive period. */
  readonly periodPeaks: number[] = []
  private params: OscillatorParams
  private stepper: Stepper
  private readonly before = new Float64Array(2)
  private currentPeak = 0
  private periodStart = 0
  /** Time the drive frequency last changed (the transient restarts then). */
  driveChangedAt = 0

  constructor(params: OscillatorParams) {
    this.params = { ...params }
    this.state = Float64Array.from([params.initialDisplacement, 0])
    this.stepper = this.makeStepper()
    this.initialEnergy = this.potentialEnergy()
  }

  private makeStepper(): Stepper {
    return createStepper(this.params.integrator, {
      dof: 1,
      acceleration: (t, q, v, a) => {
        const { mass, stiffness, damping, driveAmplitude, driveFrequency } = this.params
        a[0] = (-stiffness * q[0] - damping * v[0] + driveAmplitude * Math.cos(driveFrequency * t)) / mass
      },
    })
  }

  get parameters(): Readonly<OscillatorParams> {
    return this.params
  }

  readonly finished = false

  setDriveFrequency(omega: number): void {
    if (omega === this.params.driveFrequency) return
    this.params = { ...this.params, driveFrequency: omega }
    this.driveChangedAt = this.time
    this.periodPeaks.length = 0
    this.currentPeak = 0
    this.periodStart = this.time
  }

  step(dt: number): void {
    this.before.set(this.state)
    this.stepper.step(this.time, this.state, dt)
    if (this.before[0] > 0 && this.state[0] <= 0) {
      this.crossings.push(this.time + hermiteRoot(this.before[0], this.state[0], this.before[1], this.state[1], dt))
    }
    this.time += dt
    this.currentPeak = Math.max(this.currentPeak, Math.abs(this.state[0]))
    const drivePeriod = (2 * Math.PI) / this.params.driveFrequency
    if (this.params.driveAmplitude !== 0 && this.time - this.periodStart >= drivePeriod) {
      this.periodPeaks.push(this.currentPeak)
      this.currentPeak = 0
      this.periodStart += drivePeriod
    }
  }

  /** Mean period from all downward crossings (free oscillation), NaN before two. */
  get measuredPeriod(): number {
    const n = this.crossings.length
    return n >= 2 ? (this.crossings[n - 1] - this.crossings[0]) / (n - 1) : Number.NaN
  }

  /** Amplitude over the last full drive period once it has settled (two periods agree to 0.1 %), else NaN. */
  get settledAmplitude(): number {
    const n = this.periodPeaks.length
    if (n < 2) return Number.NaN
    const [a, b] = [this.periodPeaks[n - 2], this.periodPeaks[n - 1]]
    return Math.abs(a - b) <= 1e-3 * b ? b : Number.NaN
  }

  kineticEnergy(): number {
    return 0.5 * this.params.mass * this.state[1] ** 2
  }

  potentialEnergy(): number {
    return 0.5 * this.params.stiffness * this.state[0] ** 2
  }
}
