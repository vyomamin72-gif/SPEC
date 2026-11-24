/**
 * Fixed-timestep simulation loop ("fix your timestep" accumulator).
 *
 * Physics always advances in steps of exactly `dt`, whatever the display
 * frame rate. Real elapsed time × speed is added to an accumulator, and whole
 * steps are taken while it holds at least one dt. Consequences:
 * - Frame-rate independence: the same simulated time gives the same number
 *   of identical steps, so results are bit-identical at 30 Hz or 144 Hz.
 * - Speed changes how much simulated time passes per real second, never dt,
 *   so it never changes accuracy.
 * - If the machine cannot keep up, excess time is discarded and reported
 *   (`fellBehind`) rather than enlarging dt ("spiral of death" avoided).
 *
 * This class has no knowledge of requestAnimationFrame or rendering; a driver
 * calls advance() once per frame with the real elapsed time.
 */

export interface LoopConfig {
  /** Fixed physics timestep in seconds. */
  dt: number
  /** Cap on steps per advance() call. Default 1000. */
  maxStepsPerFrame?: number
  /** Real elapsed time above this is clamped (e.g. after a hidden tab). Default 0.25 s. */
  maxFrameTime?: number
}

export interface AdvanceResult {
  steps: number
  fellBehind: boolean
}

export class FixedStepLoop {
  readonly dt: number
  readonly maxStepsPerFrame: number
  readonly maxFrameTime: number
  private speedValue = 1
  private accumulator = 0
  private stepCount = 0
  private readonly stepFn: (t: number, dt: number) => void

  /** @param stepFn Advances the physics by exactly dt, starting at time t. */
  constructor(config: LoopConfig, stepFn: (t: number, dt: number) => void) {
    if (!(config.dt > 0) || !Number.isFinite(config.dt)) throw new RangeError('dt must be a positive finite number')
    this.dt = config.dt
    this.maxStepsPerFrame = config.maxStepsPerFrame ?? 1000
    this.maxFrameTime = config.maxFrameTime ?? 0.25
    this.stepFn = stepFn
  }

  /** Simulated time. Computed from the step count, so it never accumulates rounding error. */
  get time(): number {
    return this.stepCount * this.dt
  }

  get steps(): number {
    return this.stepCount
  }

  /** Fraction of a step pending in the accumulator, in [0, 1): for render interpolation. */
  get alpha(): number {
    return this.accumulator / this.dt
  }

  get speed(): number {
    return this.speedValue
  }

  set speed(value: number) {
    if (!(value > 0) || !Number.isFinite(value)) throw new RangeError('speed must be a positive finite number')
    this.speedValue = value
  }

  /** Advance by a real elapsed time (seconds). Non-positive or non-finite input does nothing. */
  advance(realElapsed: number): AdvanceResult {
    if (!(realElapsed > 0) || !Number.isFinite(realElapsed)) return { steps: 0, fellBehind: false }
    this.accumulator += Math.min(realElapsed, this.maxFrameTime) * this.speedValue
    let steps = 0
    while (this.accumulator >= this.dt && steps < this.maxStepsPerFrame) {
      this.stepFn(this.time, this.dt)
      this.stepCount++
      this.accumulator -= this.dt
      steps++
    }
    const fellBehind = this.accumulator >= this.dt
    if (fellBehind) this.accumulator %= this.dt
    return { steps, fellBehind }
  }

  /** Take exactly one step regardless of real time (the Step button). */
  stepOnce(): void {
    this.stepFn(this.time, this.dt)
    this.stepCount++
  }

  /** Return to t = 0. The caller resets the physical state itself. */
  reset(): void {
    this.accumulator = 0
    this.stepCount = 0
  }
}
