/**
 * Locating events (landing, zero crossings) inside a timestep.
 *
 * Stopping at the first step where an event function g changes sign gives an
 * error of up to one timestep (for a projectile, up to vₓ·dt in range). Instead
 * we re-integrate from the start of the step with a trial sub-step h and solve
 * g(state(h)) = 0 with the Illinois variant of regula falsi, which keeps the
 * root bracketed and converges superlinearly. The result is accurate to the
 * integrator's order, not to dt.
 */

export interface EventOptions {
  /** Stop when the bracket on h is narrower than this (seconds). */
  timeTolerance?: number
  maxIterations?: number
}

export interface LocatedEvent {
  /** Sub-step from the start of the step to the event, 0 < h ≤ dt. */
  h: number
  /** System state at the event. */
  state: Float64Array
  iterations: number
}

/**
 * @param before   State at the start of the step (not modified).
 * @param dt       Full step length, over which g is known to change sign.
 * @param advance  Advances a state array in place by a sub-step h, using the
 *                 same integrator as the simulation.
 * @param g        Event function; the event is where g crosses zero.
 */
export function locateEvent(
  before: Float64Array,
  dt: number,
  advance: (state: Float64Array, h: number) => void,
  g: (state: Float64Array) => number,
  { timeTolerance = 1e-12, maxIterations = 100 }: EventOptions = {},
): LocatedEvent {
  const work = new Float64Array(before.length)
  const evaluate = (h: number) => {
    work.set(before)
    advance(work, h)
    return g(work)
  }

  let lo = 0
  let fLo = g(before)
  let hi = dt
  let fHi = evaluate(dt)
  if (fLo === 0) return { h: 0, state: before.slice(), iterations: 0 }
  if (Math.sign(fLo) === Math.sign(fHi)) {
    throw new RangeError('Event function does not change sign over the step')
  }

  let side = 0
  let c = hi
  let iterations = 0
  while (iterations < maxIterations && hi - lo > timeTolerance) {
    iterations++
    c = (lo * fHi - hi * fLo) / (fHi - fLo)
    const fC = evaluate(c)
    if (fC === 0) break
    if (Math.sign(fC) === Math.sign(fHi)) {
      hi = c
      fHi = fC
      if (side === 1) fLo /= 2 // Illinois: stop the stale end from stalling convergence
      side = 1
    } else {
      lo = c
      fLo = fC
      if (side === -1) fHi /= 2
      side = -1
    }
  }
  evaluate(c)
  return { h: c, state: work.slice(), iterations }
}
