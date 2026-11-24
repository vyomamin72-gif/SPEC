/** Fixed-capacity buffer of numbers. When full, the oldest value is overwritten. */
export class RingBuffer {
  readonly capacity: number
  private readonly data: Float64Array
  private start = 0
  private count = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer')
    this.capacity = capacity
    this.data = new Float64Array(capacity)
  }

  get length(): number {
    return this.count
  }

  push(value: number): void {
    const index = (this.start + this.count) % this.capacity
    this.data[index] = value
    if (this.count < this.capacity) this.count++
    else this.start = (this.start + 1) % this.capacity
  }

  /** Value at position i, where 0 is the oldest retained value. */
  at(i: number): number {
    if (i < 0 || i >= this.count) throw new RangeError(`index ${i} out of range [0, ${this.count})`)
    return this.data[(this.start + i) % this.capacity]
  }

  /** Copy of the contents, oldest first. */
  toArray(): Float64Array {
    const out = new Float64Array(this.count)
    for (let i = 0; i < this.count; i++) out[i] = this.data[(this.start + i) % this.capacity]
    return out
  }

  clear(): void {
    this.start = 0
    this.count = 0
  }
}
