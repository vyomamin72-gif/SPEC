/**
 * Root of the cubic Hermite interpolant on one step [0, h], given values y0, y1
 * and derivatives d0, d1 at the ends (y0 and y1 must have opposite signs).
 * Third-order accurate, which is enough to time zero crossings to ~1e-12 s at
 * millisecond steps without re-integrating. Solved by bisection (robust; 60
 * halvings reach double precision).
 */
export function hermiteRoot(y0: number, y1: number, d0: number, d1: number, h: number): number {
  if (y0 === 0) return 0
  if (y1 === 0) return h
  if (Math.sign(y0) === Math.sign(y1)) throw new RangeError('values must bracket a root')
  const p = (u: number) => {
    const u2 = u * u
    const u3 = u2 * u
    return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * d0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * d1
  }
  let lo = 0
  let hi = 1
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (Math.sign(p(mid)) === Math.sign(y0)) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) * h
}
