import { createStepper } from '../core/integrators'
import type { MechanicalSystem, Stepper } from '../core/integrators'

/** Newtonian constant of gravitation (CODATA 2018), N·m²/kg². */
export const GRAVITATIONAL_CONSTANT = 6.6743e-11
/** Coulomb constant 1/(4πε₀), N·m²/C². */
export const COULOMB_CONSTANT = 8.9875517923e9

export interface PointBody {
  name: string
  mass: number
  /** Electric charge, C (Coulomb interaction only). */
  charge?: number
  x: number
  y: number
  vx: number
  vy: number
}

export type Interaction = 'gravity' | 'coulomb'

export interface NBodyParams {
  bodies: PointBody[]
  interaction: Interaction
  /** Plummer softening length ε, m. Forces use (r² + ε²)^(3/2); 0 = exact inverse square. */
  softening: number
  integrator: 'velocity-verlet' | 'rk4'
  /** Remove the total momentum so the centre of mass stays fixed. */
  centreOfMassFrame?: boolean
}

/**
 * N point bodies with a pairwise inverse-square interaction, in 2D.
 *
 * The pair coupling c_ij is positive for attraction: G·mᵢmⱼ for gravity,
 * −k·qᵢqⱼ for charges. Body i accelerates by Σⱼ c_ij (rⱼ − rᵢ) / (mᵢ (r² + ε²)^{3/2}).
 * Forces are evaluated pairwise and applied equal and opposite, so total
 * momentum is conserved to round-off. Softening ε replaces the singular
 * r⁻² force at close range; it is a numerical device, not physics, and the
 * matching softened potential −c_ij/√(r² + ε²) is used for the energy.
 */
export class NBodyModel {
  readonly bodies: readonly PointBody[]
  readonly n: number
  /** [x₀, y₀, x₁, y₁, …, vx₀, vy₀, …] */
  readonly state: Float64Array
  readonly softening: number
  time = 0
  private readonly coupling: Float64Array
  private readonly masses: Float64Array
  private readonly stepper: Stepper

  constructor(params: NBodyParams) {
    this.bodies = params.bodies.map((b) => ({ ...b }))
    const n = (this.n = this.bodies.length)
    this.softening = params.softening
    this.masses = Float64Array.from(this.bodies, (b) => b.mass)
    this.coupling = new Float64Array(n * n)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const a = this.bodies[i]
        const b = this.bodies[j]
        this.coupling[i * n + j] =
          params.interaction === 'gravity' ? GRAVITATIONAL_CONSTANT * a.mass * b.mass : -COULOMB_CONSTANT * (a.charge ?? 0) * (b.charge ?? 0)
      }
    }
    this.state = new Float64Array(4 * n)
    this.bodies.forEach((b, i) => {
      this.state[2 * i] = b.x
      this.state[2 * i + 1] = b.y
      this.state[2 * n + 2 * i] = b.vx
      this.state[2 * n + 2 * i + 1] = b.vy
    })
    if (params.centreOfMassFrame) this.toCentreOfMassFrame()
    this.stepper = createStepper(params.integrator, this.system())
  }

  private toCentreOfMassFrame(): void {
    const n = this.n
    const total = this.masses.reduce((s, m) => s + m, 0)
    let cx = 0
    let cy = 0
    let px = 0
    let py = 0
    for (let i = 0; i < n; i++) {
      cx += this.masses[i] * this.state[2 * i]
      cy += this.masses[i] * this.state[2 * i + 1]
      px += this.masses[i] * this.state[2 * n + 2 * i]
      py += this.masses[i] * this.state[2 * n + 2 * i + 1]
    }
    for (let i = 0; i < n; i++) {
      this.state[2 * i] -= cx / total
      this.state[2 * i + 1] -= cy / total
      this.state[2 * n + 2 * i] -= px / total
      this.state[2 * n + 2 * i + 1] -= py / total
    }
  }

  /** Net force on every body, [Fx₀, Fy₀, …], N. */
  forces(q: ArrayLike<number> = this.state, out = new Float64Array(2 * this.n)): Float64Array {
    const n = this.n
    const eps2 = this.softening * this.softening
    out.fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = q[2 * j] - q[2 * i]
        const dy = q[2 * j + 1] - q[2 * i + 1]
        const r2 = dx * dx + dy * dy + eps2
        const f = this.coupling[i * n + j] / (r2 * Math.sqrt(r2))
        out[2 * i] += f * dx
        out[2 * i + 1] += f * dy
        out[2 * j] -= f * dx
        out[2 * j + 1] -= f * dy
      }
    }
    return out
  }

  private system(): MechanicalSystem {
    const force = new Float64Array(2 * this.n)
    return {
      dof: 2 * this.n,
      acceleration: (_t, q, _v, a) => {
        this.forces(q, force)
        for (let i = 0; i < this.n; i++) {
          a[2 * i] = force[2 * i] / this.masses[i]
          a[2 * i + 1] = force[2 * i + 1] / this.masses[i]
        }
      },
    }
  }

  step(dt: number): void {
    this.stepper.step(this.time, this.state, dt)
    this.time += dt
  }

  position(i: number): [number, number] {
    return [this.state[2 * i], this.state[2 * i + 1]]
  }

  velocity(i: number): [number, number] {
    return [this.state[2 * this.n + 2 * i], this.state[2 * this.n + 2 * i + 1]]
  }

  kineticEnergy(): number {
    let k = 0
    for (let i = 0; i < this.n; i++) {
      const [vx, vy] = this.velocity(i)
      k += 0.5 * this.masses[i] * (vx * vx + vy * vy)
    }
    return k
  }

  potentialEnergy(): number {
    const n = this.n
    const eps2 = this.softening * this.softening
    let u = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = this.state[2 * j] - this.state[2 * i]
        const dy = this.state[2 * j + 1] - this.state[2 * i + 1]
        u -= this.coupling[i * n + j] / Math.sqrt(dx * dx + dy * dy + eps2)
      }
    }
    return u
  }

  momentum(): [number, number] {
    let px = 0
    let py = 0
    for (let i = 0; i < this.n; i++) {
      const [vx, vy] = this.velocity(i)
      px += this.masses[i] * vx
      py += this.masses[i] * vy
    }
    return [px, py]
  }

  /** z-component of total angular momentum about the origin, kg·m²/s. */
  angularMomentum(): number {
    let l = 0
    for (let i = 0; i < this.n; i++) {
      const [x, y] = this.position(i)
      const [vx, vy] = this.velocity(i)
      l += this.masses[i] * (x * vy - y * vx)
    }
    return l
  }
}
