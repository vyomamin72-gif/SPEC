import { elementsToState } from '../analysis/kepler'
import { GRAVITATIONAL_CONSTANT } from './nbody'
import type { PointBody } from './nbody'

export const ASTRONOMICAL_UNIT = 1.495978707e11 // m (IAU 2012, exact)
export const DAY = 86400 // s
export const SOLAR_MASS = 1.98847e30 // kg

export interface PlanetData {
  name: string
  /** kg */
  mass: number
  /** Semi-major axis, AU. */
  a: number
  e: number
  /** Mean longitude L at J2000, degrees. */
  meanLongitude: number
  /** Longitude of perihelion ϖ at J2000, degrees. */
  perihelionLongitude: number
  /** Observed sidereal orbital period, days (for comparison only). */
  siderealPeriodDays: number
}

/**
 * Mean orbital elements at epoch J2000 (JPL "Approximate Positions of the
 * Planets", Standish), masses from JPL planetary data. Earth's entry is the
 * Earth–Moon barycentre, as in the element set. Values are approximate, and
 * inclinations are ignored (orbits are projected onto the ecliptic plane).
 */
export const PLANETS: readonly PlanetData[] = [
  { name: 'Mercury', mass: 3.3011e23, a: 0.38709927, e: 0.20563593, meanLongitude: 252.2503235, perihelionLongitude: 77.45779628, siderealPeriodDays: 87.969 },
  { name: 'Venus', mass: 4.8675e24, a: 0.72333566, e: 0.00677672, meanLongitude: 181.9790995, perihelionLongitude: 131.60246718, siderealPeriodDays: 224.701 },
  { name: 'Earth', mass: 6.04568e24, a: 1.00000261, e: 0.01671123, meanLongitude: 100.46457166, perihelionLongitude: 102.93768193, siderealPeriodDays: 365.256 },
  { name: 'Mars', mass: 6.4171e23, a: 1.52371034, e: 0.0933941, meanLongitude: -4.55343205, perihelionLongitude: -23.94362959, siderealPeriodDays: 686.98 },
  { name: 'Jupiter', mass: 1.89819e27, a: 5.202887, e: 0.04838624, meanLongitude: 34.39644051, perihelionLongitude: 14.72847983, siderealPeriodDays: 4332.59 },
  { name: 'Saturn', mass: 5.6834e26, a: 9.53667594, e: 0.05386179, meanLongitude: 49.95424423, perihelionLongitude: 92.59887831, siderealPeriodDays: 10759.22 },
  { name: 'Uranus', mass: 8.6813e25, a: 19.18916464, e: 0.04725744, meanLongitude: 313.23810451, perihelionLongitude: 170.9542763, siderealPeriodDays: 30688.5 },
  { name: 'Neptune', mass: 1.02413e26, a: 30.06992276, e: 0.00859048, meanLongitude: -55.12002969, perihelionLongitude: 44.96476227, siderealPeriodDays: 60182 },
]

const RAD = Math.PI / 180

/** Sun and planets as point bodies (heliocentric; the model moves to the barycentre frame). */
export function solarSystemBodies(options: { massFactor?: Partial<Record<string, number>>; speedFactor?: Partial<Record<string, number>> } = {}): PointBody[] {
  const bodies: PointBody[] = [{ name: 'Sun', mass: SOLAR_MASS, x: 0, y: 0, vx: 0, vy: 0 }]
  for (const p of PLANETS) {
    const mass = p.mass * (options.massFactor?.[p.name] ?? 1)
    const mu = GRAVITATIONAL_CONSTANT * (SOLAR_MASS + mass)
    const s = elementsToState(p.a * ASTRONOMICAL_UNIT, p.e, p.perihelionLongitude * RAD, p.meanLongitude * RAD, mu)
    const k = options.speedFactor?.[p.name] ?? 1
    bodies.push({ name: p.name, mass, x: s.x, y: s.y, vx: s.vx * k, vy: s.vy * k })
  }
  return bodies
}
