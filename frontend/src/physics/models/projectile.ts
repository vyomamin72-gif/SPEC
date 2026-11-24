import { locateEvent } from '../core/events'
import { createStepper } from '../core/integrators'
import type { Stepper } from '../core/integrators'
import { projectileWithDrag } from '../core/testSystems'

export interface ProjectileParams {
  /** Launch speed, m/s. */
  speed: number
  /** Launch angle above horizontal, degrees. */
  angleDeg: number
  /** Launch height above the ground, m. */
  launchHeight: number
  /** Gravitational acceleration, m/s². */
  gravity: number
  dragEnabled: boolean
  /** kg */
  mass: number
  /** Drag coefficient C_d (dimensionless, held constant). */
  dragCoefficient: number
  /** Diameter of the spherical body, m (sets the cross-section A = πd²/4). */
  diameter: number
  /** kg/m³ */
  airDensity: number
}

export interface ProjectileTheory {
  flightTime: number
  range: number
  maxHeight: number
  apexTime: number
}

/** Closed-form drag-free results for launch from height h₀ (docs/NUMERICAL_METHODS.md §2). */
export function dragFreeTheory(speed: number, angleRad: number, launchHeight: number, gravity: number): ProjectileTheory {
  const vx = speed * Math.cos(angleRad)
  const vy = speed * Math.sin(angleRad)
  const rising = Math.max(vy, 0)
  const flightTime = (vy + Math.sqrt(vy * vy + 2 * gravity * launchHeight)) / gravity
  return {
    flightTime,
    range: vx * flightTime,
    maxHeight: launchHeight + (rising * rising) / (2 * gravity),
    apexTime: rising / gravity,
  }
}

/** k = ½ρC_dA, so that the drag force is −k|v|v. Zero when drag is disabled. */
export function dragFactor(p: ProjectileParams): number {
  if (!p.dragEnabled) return 0
  return 0.5 * p.airDensity * p.dragCoefficient * Math.PI * (p.diameter / 2) ** 2
}

/**
 * Point-mass projectile integrated with RK4. The apex (v_y = 0) and the
 * landing (y = 0) are located inside the step, so the measured height, range
 * and flight time are not limited by the timestep.
 */
export class ProjectileModel {
  /** [x, y, vx, vy] in m and m/s. */
  readonly state: Float64Array
  readonly params: ProjectileParams
  time = 0
  apex: { time: number; x: number; y: number } | null = null
  landing: { time: number; x: number; speed: number } | null = null
  private readonly stepper: Stepper
  private readonly before = new Float64Array(4)

  constructor(params: ProjectileParams) {
    this.params = params
    const angle = (params.angleDeg * Math.PI) / 180
    this.state = Float64Array.from([0, params.launchHeight, params.speed * Math.cos(angle), params.speed * Math.sin(angle)])
    this.stepper = createStepper('rk4', projectileWithDrag(params.mass, params.gravity, dragFactor(params)))
    if (this.state[3] <= 0) this.apex = { time: 0, x: 0, y: params.launchHeight }
    if (params.launchHeight <= 0 && this.state[3] <= 0) this.landing = { time: 0, x: 0, speed: params.speed }
  }

  get finished(): boolean {
    return this.landing !== null
  }

  step(dt: number): void {
    if (this.landing) return
    const t = this.time
    this.before.set(this.state)
    this.stepper.step(t, this.state, dt)
    const advance = (s: Float64Array, h: number) => this.stepper.step(t, s, h)

    if (!this.apex && this.before[3] > 0 && this.state[3] <= 0) {
      const event = locateEvent(this.before, dt, advance, (s) => s[3])
      this.apex = { time: t + event.h, x: event.state[0], y: event.state[1] }
    }
    if (this.state[1] <= 0 && this.state[3] < 0) {
      const event = locateEvent(this.before, dt, advance, (s) => s[1])
      this.state.set(event.state)
      this.state[1] = 0 // the event is located to ~1e-12 s; remove the residual
      this.time = t + event.h
      this.landing = { time: this.time, x: this.state[0], speed: Math.hypot(this.state[2], this.state[3]) }
      return
    }
    this.time = t + dt
  }
}
