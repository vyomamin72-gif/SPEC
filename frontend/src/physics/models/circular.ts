import { createRk4 } from '../core/integrators'

export interface CircularParams {
  /** Tether length, m. */
  radius: number
  /** kg */
  mass: number
  /** Initial angular velocity, rad/s. */
  initialOmega: number
  /** Tangential driving force, N (positive along the motion). */
  tangentialForce: number
}

/**
 * Point mass on an ideal inextensible tether on a frictionless horizontal
 * plane. While attached, the angle obeys θ'' = F_t / (m r) (integrated with
 * RK4, exact for constant force); the tension is whatever the constraint
 * needs, T = m ω² r. When the tether is cut the body moves in a straight line
 * with its velocity at that instant (no force acts on it).
 */
export class CircularModel {
  /** [θ, ω] while attached. */
  readonly angular = new Float64Array(2)
  /** Position and velocity after the cut. */
  free: { x: number; y: number; vx: number; vy: number; cutTime: number } | null = null
  time = 0
  private params: CircularParams
  private readonly rk4: (t: number, y: Float64Array, dt: number) => void

  constructor(params: CircularParams) {
    this.params = { ...params }
    this.angular[1] = params.initialOmega
    this.rk4 = createRk4(2, (_t, y, dy) => {
      dy[0] = y[1]
      dy[1] = this.params.tangentialForce / (this.params.mass * this.params.radius)
    })
  }

  readonly finished = false

  get parameters(): Readonly<CircularParams> {
    return this.params
  }

  setTangentialForce(force: number): void {
    this.params = { ...this.params, tangentialForce: force }
  }

  cut(): void {
    if (this.free) return
    const [theta, omega] = this.angular
    const r = this.params.radius
    this.free = {
      x: r * Math.cos(theta),
      y: r * Math.sin(theta),
      vx: -omega * r * Math.sin(theta),
      vy: omega * r * Math.cos(theta),
      cutTime: this.time,
    }
  }

  get position(): [number, number] {
    if (this.free) return [this.free.x, this.free.y]
    const r = this.params.radius
    return [r * Math.cos(this.angular[0]), r * Math.sin(this.angular[0])]
  }

  get velocity(): [number, number] {
    if (this.free) return [this.free.vx, this.free.vy]
    const [theta, omega] = this.angular
    const r = this.params.radius
    return [-omega * r * Math.sin(theta), omega * r * Math.cos(theta)]
  }

  /** Centripetal acceleration ω²r (0 once cut). */
  get centripetalAcceleration(): number {
    return this.free ? 0 : this.angular[1] ** 2 * this.params.radius
  }

  get tangentialAcceleration(): number {
    return this.free ? 0 : this.params.tangentialForce / this.params.mass
  }

  get tension(): number {
    return this.params.mass * this.centripetalAcceleration
  }

  step(dt: number): void {
    if (this.free) {
      this.free.x += this.free.vx * dt
      this.free.y += this.free.vy * dt
    } else {
      this.rk4(this.time, this.angular, dt)
    }
    this.time += dt
  }
}
