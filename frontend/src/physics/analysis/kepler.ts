/** Solve Kepler's equation E − e sin E = M for the eccentric anomaly (Newton's method). */
export function solveKepler(meanAnomaly: number, e: number): number {
  const M = ((meanAnomaly % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1)
  for (let i = 0; i < 50; i++) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= delta
    if (Math.abs(delta) < 1e-15) break
  }
  return E
}

export interface OrbitalState {
  x: number
  y: number
  vx: number
  vy: number
}

/**
 * Planar position and velocity relative to the central body from orbital
 * elements: semi-major axis a (m), eccentricity e, longitude of perihelion ϖ
 * and mean longitude L (radians), with μ = G(M + m) (m³/s²). Inclination is
 * ignored: the orbit is projected onto the reference plane.
 */
export function elementsToState(a: number, e: number, perihelionLongitude: number, meanLongitude: number, mu: number): OrbitalState {
  const E = solveKepler(meanLongitude - perihelionLongitude, e)
  const b = a * Math.sqrt(1 - e * e)
  const xp = a * (Math.cos(E) - e)
  const yp = b * Math.sin(E)
  const Edot = Math.sqrt(mu / (a * a * a)) / (1 - e * Math.cos(E))
  const vxp = -a * Math.sin(E) * Edot
  const vyp = b * Math.cos(E) * Edot
  const c = Math.cos(perihelionLongitude)
  const s = Math.sin(perihelionLongitude)
  return { x: c * xp - s * yp, y: s * xp + c * yp, vx: c * vxp - s * vyp, vy: s * vxp + c * vyp }
}

/** Kepler's third law: T = 2π √(a³ / μ). */
export function keplerPeriod(a: number, mu: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / mu)
}
