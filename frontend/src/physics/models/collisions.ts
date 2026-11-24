/**
 * One-dimensional collisions on a frictionless track, event-driven.
 *
 * Between collisions every body moves at constant velocity, so the time of the
 * next contact is computed exactly (gap / closing speed) instead of being
 * detected after overlap (docs/NUMERICAL_METHODS.md §5). Contacts are resolved
 * with a coefficient of restitution e:
 *   v₁' = (m₁v₁ + m₂v₂ + m₂e(v₂ − v₁)) / (m₁ + m₂), and symmetrically for v₂'.
 * Momentum is conserved to round-off for every e; kinetic energy decreases by
 * exactly ½μ(1 − e²)(v₁ − v₂)².
 */

export interface CollisionBody {
  mass: number
  /** Centre position, m. */
  x: number
  /** Velocity, m/s. */
  v: number
  /** Length along the track, m. */
  width: number
}

export interface CollisionParams {
  bodies: { mass: number; x: number; v: number; width: number }[]
  restitution: number
  /** Elastic walls at 0 and trackLength. Walls are external: they change momentum. */
  walls: boolean
  trackLength: number
}

/** Pairwise outcome of one collision, for comparison with theory. */
export function resolveVelocities(m1: number, v1: number, m2: number, v2: number, e: number): [number, number] {
  const p = m1 * v1 + m2 * v2
  const M = m1 + m2
  return [(p + m2 * e * (v2 - v1)) / M, (p + m1 * e * (v1 - v2)) / M]
}

/** Kinetic energy lost in one collision: ½μ(1 − e²)(v₁ − v₂)². */
export function collisionEnergyLoss(m1: number, v1: number, m2: number, v2: number, e: number): number {
  const mu = (m1 * m2) / (m1 + m2)
  return 0.5 * mu * (1 - e * e) * (v1 - v2) ** 2
}

const CONTACT_TOLERANCE = 1e-12
/** Inelastic-collapse safeguard: maximum contacts resolved within one timestep. */
export const MAX_COLLISIONS_PER_STEP = 1000

export interface CollisionRecord {
  time: number
  left: number
  /** Index of the right body, or -1 for a wall hit by `left`. */
  right: number
  before: [number, number]
  after: [number, number]
}

export class CollisionModel {
  readonly bodies: CollisionBody[]
  readonly restitution: number
  readonly walls: boolean
  readonly trackLength: number
  time = 0
  readonly collisions: CollisionRecord[] = []
  /** True once the per-step collision cap was hit and touching bodies were merged. */
  safeguardEngaged = false
  private lastEventTime = 0

  constructor(params: CollisionParams) {
    this.bodies = params.bodies.map((b) => ({ ...b })).sort((a, b) => a.x - b.x)
    this.restitution = params.restitution
    this.walls = params.walls
    this.trackLength = params.trackLength
  }

  get momentum(): number {
    return this.bodies.reduce((sum, b) => sum + b.mass * b.v, 0)
  }

  get kineticEnergy(): number {
    return this.bodies.reduce((sum, b) => sum + 0.5 * b.mass * b.v * b.v, 0)
  }

  private gap(i: number): number {
    const a = this.bodies[i]
    const b = this.bodies[i + 1]
    return b.x - a.x - (a.width + b.width) / 2
  }

  /** Earliest event within `horizon`: [time, left index, right index or -1/-2 for left/right wall]. */
  private nextEvent(horizon: number): [number, number, number] | null {
    let best: [number, number, number] | null = null
    const consider = (t: number, i: number, j: number) => {
      if (t <= horizon && (!best || t < best[0])) best = [t, i, j]
    }
    for (let i = 0; i < this.bodies.length - 1; i++) {
      const closing = this.bodies[i].v - this.bodies[i + 1].v
      if (closing > 0) consider(Math.max(0, this.gap(i)) / closing, i, i + 1)
    }
    if (this.walls) {
      const first = this.bodies[0]
      const last = this.bodies[this.bodies.length - 1]
      if (first.v < 0) consider(Math.max(0, first.x - first.width / 2) / -first.v, 0, -1)
      if (last.v > 0) consider(Math.max(0, this.trackLength - last.x - last.width / 2) / last.v, this.bodies.length - 1, -2)
    }
    return best
  }

  /** True when, without walls, no pair is approaching: nothing more can happen. */
  get collisionsOver(): boolean {
    return !this.walls && this.nextEvent(Infinity) === null
  }

  /** Ends 3 s after the last possible collision (no walls), so the outcome stays visible. */
  get finished(): boolean {
    return this.collisionsOver && this.time >= this.lastEventTime + 3
  }

  private drift(h: number): void {
    for (const b of this.bodies) b.x += b.v * h
  }

  step(dt: number): void {
    let remaining = dt
    let count = 0
    for (;;) {
      const event = this.nextEvent(remaining)
      if (!event) break
      const [t, i, j] = event
      this.drift(t)
      remaining -= t
      const now = this.time + (dt - remaining)
      if (++count > MAX_COLLISIONS_PER_STEP) {
        this.mergeTouchingBodies()
        break
      }
      if (j < 0) {
        const b = this.bodies[i]
        const before = b.v
        b.v = -b.v // elastic wall
        this.collisions.push({ time: now, left: i, right: -1, before: [before, 0], after: [b.v, 0] })
      } else {
        const a = this.bodies[i]
        const b = this.bodies[j]
        const before: [number, number] = [a.v, b.v]
        ;[a.v, b.v] = resolveVelocities(a.mass, a.v, b.mass, b.v, this.restitution)
        this.collisions.push({ time: now, left: i, right: j, before, after: [a.v, b.v] })
      }
      this.lastEventTime = now
    }
    this.drift(remaining)
    this.time += dt
  }

  /**
   * Inelastic collapse: with e < 1 and three or more bodies, the number of
   * collisions can grow without bound in finite time. When the per-step cap
   * is hit, bodies in contact are given their common momentum-weighted
   * velocity (a perfectly inelastic merge), which conserves momentum.
   */
  private mergeTouchingBodies(): void {
    this.safeguardEngaged = true
    let start = 0
    for (let i = 0; i <= this.bodies.length - 1; i++) {
      const touchingNext = i < this.bodies.length - 1 && this.gap(i) <= 1e-9
      if (!touchingNext) {
        const group = this.bodies.slice(start, i + 1)
        const mass = group.reduce((s, b) => s + b.mass, 0)
        const v = group.reduce((s, b) => s + b.mass * b.v, 0) / mass
        for (const b of group) b.v = v
        start = i + 1
      }
    }
  }
}

export { CONTACT_TOLERANCE }
