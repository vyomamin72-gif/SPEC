import { MU_0 } from './fields'

/**
 * Magnetic flux of a point dipole (moment m along the coil axis) through one
 * coaxial circular loop of radius a at axial distance x:
 *   Φ(x) = μ₀ m a² / (2 (a² + x²)^{3/2})
 * (exact for a point dipole; a real magnet of finite size differs close up).
 */
export function dipoleFlux(moment: number, radius: number, x: number): number {
  return (MU_0 * moment * radius * radius) / (2 * (radius * radius + x * x) ** 1.5)
}

/** dΦ/dx, analytically. */
export function dipoleFluxGradient(moment: number, radius: number, x: number): number {
  return (-3 * MU_0 * moment * radius * radius * x) / (2 * (radius * radius + x * x) ** 2.5)
}

/** Faraday's law for N turns and a magnet moving at velocity v: ε = −N dΦ/dt = −N (dΦ/dx) v. */
export function inducedEmf(turns: number, moment: number, radius: number, x: number, v: number): number {
  return -turns * dipoleFluxGradient(moment, radius, x) * v
}
