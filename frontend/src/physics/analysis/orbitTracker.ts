/**
 * Measures orbital periods by following a body's angle around a centre.
 * The angle is unwrapped step by step; each time the accumulated angle
 * passes another full turn, the crossing time is found by linear
 * interpolation inside the step.
 */
export class OrbitTracker {
  private accumulated = 0
  private lastAngle: number
  private lastTime = 0
  readonly crossings: number[] = []

  constructor(initialAngle: number) {
    this.lastAngle = initialAngle
  }

  update(time: number, angle: number): void {
    let delta = angle - this.lastAngle
    if (delta > Math.PI) delta -= 2 * Math.PI
    if (delta < -Math.PI) delta += 2 * Math.PI
    const before = this.accumulated
    this.accumulated += delta
    const turnsBefore = Math.floor(Math.abs(before) / (2 * Math.PI))
    const turnsAfter = Math.floor(Math.abs(this.accumulated) / (2 * Math.PI))
    if (turnsAfter > turnsBefore) {
      const target = Math.sign(this.accumulated) * 2 * Math.PI * turnsAfter
      const fraction = (target - before) / (this.accumulated - before)
      this.crossings.push(this.lastTime + fraction * (time - this.lastTime))
    }
    this.lastAngle = angle
    this.lastTime = time
  }

  /** Duration of the most recent complete orbit, or NaN before the first. */
  get period(): number {
    const n = this.crossings.length
    if (n === 0) return Number.NaN
    return n === 1 ? this.crossings[0] : this.crossings[n - 1] - this.crossings[n - 2]
  }

  get orbits(): number {
    return this.crossings.length
  }
}
