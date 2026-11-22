/**
 * Complete elliptic integral of the first kind, K(k) with modulus k,
 * via the arithmetic–geometric mean: K(k) = π / (2·AGM(1, √(1 − k²))).
 * AGM converges quadratically: about 5–6 iterations reach double precision.
 * Used for the exact period of the nonlinear pendulum, T = 4√(L/g)·K(sin(θ₀/2)).
 */
export function completeEllipticK(k: number): number {
  const m = k * k
  if (!(m < 1)) return m === 1 ? Infinity : Number.NaN
  let a = 1
  let b = Math.sqrt(1 - m)
  for (let i = 0; i < 50 && Math.abs(a - b) > 1e-16 * a; i++) {
    const next = (a + b) / 2
    b = Math.sqrt(a * b)
    a = next
  }
  return Math.PI / (2 * a)
}
