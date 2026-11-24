import { expect, it } from 'vitest'
import { hermiteRoot } from './interpolation'

it('times a zero crossing of sin(ωt) far more accurately than the step', () => {
  // Root at t = π/ω. Hermite error is O(h⁴): with ωh = 0.01 the error is ~1e-12 s.
  const omega = 3
  const h = 0.01 / omega
  const t0 = Math.PI / omega - 0.3 * h
  const root = t0 + hermiteRoot(Math.sin(omega * t0), Math.sin(omega * (t0 + h)), omega * Math.cos(omega * t0), omega * Math.cos(omega * (t0 + h)), h)
  expect(Math.abs(root - Math.PI / omega)).toBeLessThan(1e-11)
  expect(() => hermiteRoot(1, 2, 0, 0, 1)).toThrow(RangeError)
})
