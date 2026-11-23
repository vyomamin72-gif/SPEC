import { RingBuffer } from './RingBuffer'

/**
 * Records named channels at a fixed *simulation-time* interval, so recorded
 * data does not depend on the display frame rate. Memory is bounded by
 * `capacity` samples per channel; the oldest samples are dropped.
 */
export class TimeSeriesRecorder<Channel extends string> {
  readonly channels: readonly Channel[]
  readonly interval: number
  /** While paused, samples are ignored (the simulation may keep running). */
  paused = false
  /** Increments whenever data changes; lets charts skip redundant redraws. */
  version = 0
  private readonly time: RingBuffer
  private readonly buffers: Map<Channel, RingBuffer>
  private nextSampleIndex = 0

  constructor(channels: readonly Channel[], { interval, capacity }: { interval: number; capacity: number }) {
    if (!(interval > 0)) throw new RangeError('interval must be positive')
    this.channels = channels
    this.interval = interval
    this.time = new RingBuffer(capacity)
    this.buffers = new Map(channels.map((c) => [c, new RingBuffer(capacity)]))
  }

  get length(): number {
    return this.time.length
  }

  /**
   * Offer a sample at simulation time t. It is stored only when t has reached
   * the next multiple of the interval (computed from an integer index, so the
   * schedule never drifts). `values` follows the order of `channels`.
   */
  sample(t: number, values: ArrayLike<number>, force = false): boolean {
    if (this.paused) return false
    // Tolerance absorbs rounding in t = steps × dt (e.g. 3 × 0.1 ≠ 0.3).
    // `force` records off-schedule, e.g. the exact final state when a run ends.
    if (!force && t < this.nextSampleIndex * this.interval - 1e-9 * this.interval) return false
    if (values.length !== this.channels.length) throw new RangeError('values must match channels')
    this.time.push(t)
    this.channels.forEach((channel, i) => this.buffers.get(channel)?.push(values[i]))
    this.nextSampleIndex = Math.floor(t / this.interval + 1e-9) + 1
    this.version++
    return true
  }

  times(): Float64Array {
    return this.time.toArray()
  }

  series(channel: Channel): Float64Array {
    const buffer = this.buffers.get(channel)
    if (!buffer) throw new RangeError(`unknown channel ${channel}`)
    return buffer.toArray()
  }

  clear(): void {
    this.time.clear()
    this.buffers.forEach((b) => b.clear())
    this.nextSampleIndex = 0
    this.version++
  }
}
