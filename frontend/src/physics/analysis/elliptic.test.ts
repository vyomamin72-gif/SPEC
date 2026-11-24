import { describe, expect, it } from 'vitest'
import { completeEllipticK } from './elliptic'

describe('completeEllipticK', () => {
  it('matches known values', () => {
    expect(completeEllipticK(0)).toBe(Math.PI / 2)
    // K(1/√2) = Γ(1/4)² / (4√π) = 1.8540746773013719…
    expect(completeEllipticK(Math.SQRT1_2)).toBeCloseTo(1.8540746773013719, 14)
  })

  it('agrees with the small-k series π/2·(1 + k²/4 + 9k⁴/64 + 25k⁶/256)', () => {
    // The next term, 1225k⁸/16384 ≈ 1e-17 at k = 0.01, is below double precision.
    const k = 0.01
    const series = (Math.PI / 2) * (1 + k ** 2 / 4 + (9 * k ** 4) / 64 + (25 * k ** 6) / 256)
    expect(completeEllipticK(k)).toBeCloseTo(series, 15)
  })

  it('diverges at k = 1 and is undefined beyond', () => {
    expect(completeEllipticK(1)).toBe(Infinity)
    expect(completeEllipticK(1.5)).toBeNaN()
  })
})
