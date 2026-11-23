import { locateEvent } from '../core/events'

export type NewtonScenario = 'push' | 'pulley'
export type FrictionKind = 'static' | 'kinetic' | 'none'

export interface NewtonParams {
  scenario: NewtonScenario
  /** Block on the surface, kg. */
  mass: number
  /** Hanging mass (pulley scenario), kg. */
  hangingMass: number
  /** Horizontal force on the block (push scenario), N. Positive = rightwards. */
  appliedForce: number
  staticFriction: number
  kineticFriction: number
  gravity: number
}

/** Push scenario: the track ends this far from the start in either direction (m). */
export const TRACK_HALF_LENGTH = 20
/** Pulley scenario: height of the hanging mass above the floor at release (m). */
export const DROP_HEIGHT = 1.5

/** The 1D problem both scenarios reduce to: total moving mass, driving force, friction limits. */
export interface FrictionProblem {
  mass: number
  drive: number
  staticLimit: number
  kineticForce: number
}

/**
 * Acceleration and friction for velocity v under Coulomb friction.
 * At rest, static friction balances the drive exactly up to its limit;
 * otherwise kinetic friction opposes the (impending) motion.
 */
export function frictionResponse(v: number, p: FrictionProblem): { a: number; friction: number; kind: FrictionKind } {
  if (v === 0) {
    if (Math.abs(p.drive) <= p.staticLimit) return { a: 0, friction: -p.drive, kind: p.drive === 0 ? 'none' : 'static' }
    const friction = -Math.sign(p.drive) * p.kineticForce
    return { a: (p.drive + friction) / p.mass, friction, kind: p.kineticForce === 0 ? 'none' : 'kinetic' }
  }
  const friction = -Math.sign(v) * p.kineticForce
  return { a: (p.drive + friction) / p.mass, friction, kind: p.kineticForce === 0 ? 'none' : 'kinetic' }
}

/**
 * Advance [x, v] by h exactly. Between friction events the acceleration is
 * constant, so x += v·h + ½a·h² is exact. If the velocity would change sign,
 * the stop time −v/a is computed, the body is set exactly at rest, and the
 * friction regime is re-evaluated for the rest of the step. Friction therefore
 * can never reverse motion (docs/NUMERICAL_METHODS.md §4).
 */
export function advanceExact(state: Float64Array, h: number, p: FrictionProblem): void {
  let remaining = h
  for (let i = 0; i < 4 && remaining > 0; i++) {
    const v = state[1]
    const { a } = frictionResponse(v, p)
    if (v !== 0 && a !== 0 && Math.sign(a) !== Math.sign(v)) {
      const stopTime = -v / a
      if (stopTime <= remaining) {
        state[0] += v * stopTime + 0.5 * a * stopTime * stopTime
        state[1] = 0
        remaining -= stopTime
        continue
      }
    }
    state[0] += v * remaining + 0.5 * a * remaining * remaining
    state[1] += a * remaining
    remaining = 0
  }
}

export interface BlockForces {
  /** Applied force (push) or string tension (pulley) on the block, N. */
  pulling: number
  friction: number
  frictionKind: FrictionKind
  normal: number
  weight: number
  /** Net horizontal force on the block, N. */
  net: number
  /** String tension (pulley only, else 0), N. */
  tension: number
  /** Weight of the hanging mass (pulley only, else 0), N. */
  hangingWeight: number
}

/**
 * Block on a horizontal surface with Coulomb friction, either pushed by an
 * applied force or pulled by a hanging mass over an ideal pulley.
 */
export class NewtonModel {
  /** [x (m), v (m/s)]; in the pulley scenario x is the distance moved towards the pulley. */
  readonly state = new Float64Array(2)
  time = 0
  finished: null | 'track-end' | 'floor' = null
  /** Position where the block last came to rest after moving, if any. */
  lastStopPosition: number | null = null
  /** True until the applied force is changed during a run (theory needs a constant force). */
  forceConstantSinceStart = true
  private params: NewtonParams
  private readonly before = new Float64Array(2)

  constructor(params: NewtonParams) {
    this.params = { ...params }
  }

  get parameters(): Readonly<NewtonParams> {
    return this.params
  }

  /** μk is clamped to μs: kinetic friction exceeding static friction is not a consistent Coulomb model. */
  get effectiveKineticFriction(): number {
    return Math.min(this.params.kineticFriction, this.params.staticFriction)
  }

  setAppliedForce(force: number): void {
    if (force !== this.params.appliedForce && this.time > 0) this.forceConstantSinceStart = false
    this.params = { ...this.params, appliedForce: force }
  }

  problem(): FrictionProblem {
    const { scenario, mass, hangingMass, appliedForce, staticFriction, gravity } = this.params
    const normal = mass * gravity
    return scenario === 'push'
      ? { mass, drive: appliedForce, staticLimit: staticFriction * normal, kineticForce: this.effectiveKineticFriction * normal }
      : {
          mass: mass + hangingMass,
          drive: hangingMass * gravity,
          staticLimit: staticFriction * normal,
          kineticForce: this.effectiveKineticFriction * normal,
        }
  }

  acceleration(): number {
    return frictionResponse(this.state[1], this.problem()).a
  }

  forces(): BlockForces {
    const { scenario, mass, hangingMass, appliedForce, gravity } = this.params
    const { a, friction, kind } = frictionResponse(this.state[1], this.problem())
    const tension = scenario === 'pulley' ? hangingMass * (gravity - a) : 0
    const pulling = scenario === 'push' ? appliedForce : tension
    return {
      pulling,
      friction,
      frictionKind: kind,
      normal: mass * gravity,
      weight: mass * gravity,
      net: pulling + friction,
      tension,
      hangingWeight: scenario === 'pulley' ? hangingMass * gravity : 0,
    }
  }

  step(dt: number): void {
    if (this.finished) return
    const p = this.problem()
    this.before.set(this.state)
    advanceExact(this.state, dt, p)
    if (this.before[1] !== 0 && this.state[1] === 0) this.lastStopPosition = this.state[0]

    const pulley = this.params.scenario === 'pulley'
    const limit = pulley ? DROP_HEIGHT : TRACK_HALF_LENGTH
    const distanceLeft = (s: Float64Array) => limit - (pulley ? s[0] : Math.abs(s[0]))
    if (distanceLeft(this.state) <= 0) {
      const event = locateEvent(this.before, dt, (s, h) => advanceExact(s, h, p), distanceLeft)
      this.state.set(event.state)
      this.time += event.h
      this.finished = pulley ? 'floor' : 'track-end'
      return
    }
    this.time += dt
  }
}
