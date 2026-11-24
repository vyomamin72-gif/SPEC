import { COULOMB_CONSTANT } from './nbody'

/** Vacuum permeability μ₀, T·m/A (CODATA 2018). */
export const MU_0 = 1.25663706212e-6
/** Vacuum permittivity ε₀ = 1/(4πk), F/m. */
export const EPSILON_0 = 1 / (4 * Math.PI * COULOMB_CONSTANT)

export interface PointCharge {
  /** C */
  q: number
  x: number
  y: number
}

/** Electric field of static point charges at (x, y) by superposition, V/m (Coulomb's law). */
export function electricField(charges: readonly PointCharge[], x: number, y: number): [number, number] {
  let ex = 0
  let ey = 0
  for (const c of charges) {
    const dx = x - c.x
    const dy = y - c.y
    const r2 = dx * dx + dy * dy
    if (r2 === 0) return [Number.NaN, Number.NaN]
    const f = (COULOMB_CONSTANT * c.q) / (r2 * Math.sqrt(r2))
    ex += f * dx
    ey += f * dy
  }
  return [ex, ey]
}

/** Electric potential V = Σ kq/r, volts (zero at infinity). */
export function electricPotential(charges: readonly PointCharge[], x: number, y: number): number {
  let v = 0
  for (const c of charges) v += (COULOMB_CONSTANT * c.q) / Math.hypot(x - c.x, y - c.y)
  return v
}

export interface LineCurrent {
  /** Current out of the page (+) or into it (−), A. */
  current: number
  x: number
  y: number
}

/**
 * Magnetic field in the page plane of long straight wires perpendicular to
 * it: |B| = μ₀I/(2πr), circling each wire (right-hand rule), tesla.
 */
export function wireField(wires: readonly LineCurrent[], x: number, y: number): [number, number] {
  let bx = 0
  let by = 0
  for (const w of wires) {
    const dx = x - w.x
    const dy = y - w.y
    const r2 = dx * dx + dy * dy
    if (r2 === 0) return [Number.NaN, Number.NaN]
    const f = (MU_0 * w.current) / (2 * Math.PI * r2)
    bx += -f * dy
    by += f * dx
  }
  return [bx, by]
}

/**
 * Trace a field line with RK4 along the unit field direction (arc-length
 * parameterisation). Stops after maxSteps, when it leaves the bounds, when
 * the field vanishes, or when `stop` says so (e.g. near a charge).
 */
export function traceFieldLine(
  field: (x: number, y: number) => [number, number],
  start: [number, number],
  options: { step: number; maxSteps: number; direction?: 1 | -1; bounds: { xMin: number; xMax: number; yMin: number; yMax: number }; stop?: (x: number, y: number) => boolean },
): [number, number][] {
  const sign = options.direction ?? 1
  const dir = (x: number, y: number): [number, number] => {
    const [fx, fy] = field(x, y)
    const m = Math.hypot(fx, fy)
    return m > 0 && Number.isFinite(m) ? [(sign * fx) / m, (sign * fy) / m] : [Number.NaN, Number.NaN]
  }
  const points: [number, number][] = [start]
  let [x, y] = start
  const h = options.step
  const { xMin, xMax, yMin, yMax } = options.bounds
  for (let i = 0; i < options.maxSteps; i++) {
    const k1 = dir(x, y)
    const k2 = dir(x + (h / 2) * k1[0], y + (h / 2) * k1[1])
    const k3 = dir(x + (h / 2) * k2[0], y + (h / 2) * k2[1])
    const k4 = dir(x + h * k3[0], y + h * k3[1])
    const nx = x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
    const ny = y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) break
    x = nx
    y = ny
    points.push([x, y])
    if (x < xMin || x > xMax || y < yMin || y > yMax || options.stop?.(x, y)) break
  }
  return points
}

/**
 * Boris pusher for a charge in uniform fields E (in plane) and B (out of
 * the page, B_z). In a pure magnetic field it rotates the velocity exactly,
 * so the speed is conserved to round-off at any timestep.
 * State: [x, y, vx, vy].
 */
export function borisStep(state: Float64Array, dt: number, chargeToMass: number, e: [number, number], bz: number): void {
  const half = (chargeToMass * dt) / 2
  // Half electric kick
  let vx = state[2] + half * e[0]
  let vy = state[3] + half * e[1]
  // Magnetic rotation
  const t = half * bz
  const s = (2 * t) / (1 + t * t)
  const vpx = vx + vy * t
  const vpy = vy - vx * t
  vx += vpy * s
  vy -= vpx * s
  // Second half electric kick
  vx += half * e[0]
  vy += half * e[1]
  state[2] = vx
  state[3] = vy
  state[0] += vx * dt
  state[1] += vy * dt
}
