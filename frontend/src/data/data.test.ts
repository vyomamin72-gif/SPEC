import { describe, expect, it } from 'vitest'
import { RingBuffer } from './RingBuffer'
import { TimeSeriesRecorder } from './TimeSeriesRecorder'

describe('RingBuffer', () => {
  it('keeps the newest values in order once full', () => {
    const buffer = new RingBuffer(3)
    for (const v of [1, 2, 3, 4, 5]) buffer.push(v)
    expect(buffer.length).toBe(3)
    expect(Array.from(buffer.toArray())).toEqual([3, 4, 5])
    expect(buffer.at(0)).toBe(3)
    expect(() => buffer.at(3)).toThrow(RangeError)
    buffer.clear()
    expect(buffer.length).toBe(0)
  })

  it('rejects invalid capacities', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError)
    expect(() => new RingBuffer(2.5)).toThrow(RangeError)
  })
})

describe('TimeSeriesRecorder', () => {
  it('samples on a simulation-time schedule, independent of how often it is called', () => {
    const counts = [1e-3, 3e-3].map((dt) => {
      const recorder = new TimeSeriesRecorder(['x'], { interval: 0.01, capacity: 1000 })
      for (let step = 0; step * dt <= 1 + 1e-12; step++) recorder.sample(step * dt, [step])
      return recorder.length
    })
    // Samples at t = 0, 0.01, …, 1.00 → 101 for dt = 1 ms. With dt = 3 ms the
    // first step at or after each multiple is taken; the last multiple ≤ 0.999 is 0.99.
    expect(counts).toEqual([101, 100])
  })

  it('stores channels in order, bounds memory, pauses and clears', () => {
    const recorder = new TimeSeriesRecorder(['x', 'v'] as const, { interval: 1, capacity: 2 })
    recorder.sample(0, [10, 20])
    recorder.sample(1, [11, 21])
    recorder.sample(2, [12, 22])
    expect(Array.from(recorder.times())).toEqual([1, 2])
    expect(Array.from(recorder.series('v'))).toEqual([21, 22])
    const version = recorder.version
    recorder.paused = true
    expect(recorder.sample(3, [13, 23])).toBe(false)
    expect(recorder.version).toBe(version)
    recorder.paused = false
    recorder.clear()
    expect(recorder.length).toBe(0)
    expect(() => recorder.sample(0, [1])).toThrow(RangeError)
  })
})
