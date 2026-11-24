/** Boltzmann constant, J/K (exact, SI 2019). */
export const BOLTZMANN = 1.380649e-23
/** Argon atom: mass (kg) and hard-sphere diameter (m). */
export const ARGON_MASS = 6.6335e-26
export const ARGON_DIAMETER = 0.34e-9

export interface GasParams {
  count: number
  /** Square box side, m. */
  boxSize: number
  /** Particle mass, kg. */
  mass: number
  /** Disk diameter, m. */
  diameter: number
  /** Initial temperature, K: every particle starts at the speed √(2kT/m) in a random direction. */
  temperature: number
  /** Seed for the random initial positions and directions (reproducible runs). */
  seed?: number
}

/** Ideal 2D gas: P·A = N k T (pressure is a force per unit length in 2D). */
export function idealPressure2D(count: number, temperature: number, area: number): number {
  return (count * BOLTZMANN * temperature) / area
}

/** Area fraction η = N π σ² / (4A) occupied by the disks. */
export function packingFraction(count: number, diameter: number, area: number): number {
  return (count * Math.PI * diameter * diameter) / (4 * area)
}

/** Henderson's equation of state for hard disks: P A / (N k T) = (1 + η²/8) / (1 − η)². */
export function hendersonCompressibility(eta: number): number {
  return (1 + (eta * eta) / 8) / (1 - eta) ** 2
}

/** 2D Maxwell–Boltzmann speed distribution f(v) = (m v / kT) e^{−m v² / 2kT}. */
export function maxwellBoltzmann2D(v: number, mass: number, temperature: number): number {
  const a = mass / (BOLTZMANN * temperature)
  return a * v * Math.exp(-0.5 * a * v * v)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Two-dimensional gas of hard disks (molecular dynamics, fixed timestep).
 *
 * Disks move freely between collisions. Each step, overlapping pairs that are
 * approaching collide elastically along their line of centres (equal masses:
 * the normal velocity components are exchanged), which conserves momentum and
 * kinetic energy exactly; the overlap is then removed by moving both disks
 * apart, which changes no velocity. Walls reflect elastically, and the
 * momentum they receive measures the pressure. A uniform grid of cells limits
 * the pair search to neighbours, so a step costs O(N).
 *
 * The timestep must keep the distance moved per step well below a diameter;
 * otherwise collisions can be missed. This is a time-stepped approximation of
 * exact hard-disk dynamics; event-driven MD would avoid it at higher cost.
 */
export class GasModel {
  readonly n: number
  readonly box: number
  readonly mass: number
  readonly diameter: number
  readonly x: Float64Array
  readonly y: Float64Array
  readonly vx: Float64Array
  readonly vy: Float64Array
  time = 0
  collisions = 0
  /** Total momentum delivered to the walls since the window started, kg·m/s. */
  private wallImpulse = 0
  private windowStart = 0
  /** Pressure averaged over the last completed measurement window, N/m. */
  pressure = Number.NaN
  readonly pressureWindow: number
  private readonly cells: number
  private readonly cellHead: Int32Array
  private readonly cellNext: Int32Array

  constructor(params: GasParams, pressureWindow = 50e-12) {
    this.n = params.count
    this.box = params.boxSize
    this.mass = params.mass
    this.diameter = params.diameter
    this.pressureWindow = pressureWindow
    this.x = new Float64Array(this.n)
    this.y = new Float64Array(this.n)
    this.vx = new Float64Array(this.n)
    this.vy = new Float64Array(this.n)
    const random = mulberry32(params.seed ?? 1)
    // Place disks on a jittered grid so none overlap initially.
    const perRow = Math.ceil(Math.sqrt(this.n))
    const spacing = this.box / perRow
    if (spacing < 1.2 * this.diameter) throw new RangeError('Too many particles for this box: they cannot be placed without overlap')
    const speed = Math.sqrt((2 * BOLTZMANN * params.temperature) / this.mass)
    for (let i = 0; i < this.n; i++) {
      const jitter = (spacing - 1.1 * this.diameter) / 2
      this.x[i] = (i % perRow + 0.5) * spacing + (random() - 0.5) * 2 * jitter
      this.y[i] = (Math.floor(i / perRow) + 0.5) * spacing + (random() - 0.5) * 2 * jitter
      const angle = 2 * Math.PI * random()
      this.vx[i] = speed * Math.cos(angle)
      this.vy[i] = speed * Math.sin(angle)
    }
    this.cells = Math.max(1, Math.floor(this.box / (1.5 * this.diameter)))
    this.cellHead = new Int32Array(this.cells * this.cells)
    this.cellNext = new Int32Array(this.n)
  }

  get area(): number {
    return this.box * this.box
  }

  kineticEnergy(): number {
    let k = 0
    for (let i = 0; i < this.n; i++) k += this.vx[i] ** 2 + this.vy[i] ** 2
    return 0.5 * this.mass * k
  }

  /** Kinetic temperature: in 2D each particle has two degrees of freedom, so ⟨KE⟩ = kT. */
  temperature(): number {
    return this.kineticEnergy() / (this.n * BOLTZMANN)
  }

  /** Scale all velocities to reach temperature T (an idealised thermostat: heating or cooling). */
  setTemperature(t: number): void {
    const f = Math.sqrt(t / this.temperature())
    for (let i = 0; i < this.n; i++) {
      this.vx[i] *= f
      this.vy[i] *= f
    }
    this.wallImpulse = 0
    this.windowStart = this.time
  }

  speeds(): Float64Array {
    return Float64Array.from({ length: this.n }, (_, i) => Math.hypot(this.vx[i], this.vy[i]))
  }

  private buildCells(): void {
    this.cellHead.fill(-1)
    const size = this.box / this.cells
    for (let i = 0; i < this.n; i++) {
      const cx = Math.min(this.cells - 1, Math.max(0, Math.floor(this.x[i] / size)))
      const cy = Math.min(this.cells - 1, Math.max(0, Math.floor(this.y[i] / size)))
      const c = cy * this.cells + cx
      this.cellNext[i] = this.cellHead[c]
      this.cellHead[c] = i
    }
  }

  private collide(i: number, j: number): void {
    const dx = this.x[j] - this.x[i]
    const dy = this.y[j] - this.y[i]
    const d2 = dx * dx + dy * dy
    const sigma = this.diameter
    if (d2 >= sigma * sigma || d2 === 0) return
    const d = Math.sqrt(d2)
    const nx = dx / d
    const ny = dy / d
    const approach = (this.vx[j] - this.vx[i]) * nx + (this.vy[j] - this.vy[i]) * ny
    if (approach < 0) {
      // Equal masses, elastic: exchange the velocity components along n.
      this.vx[i] += approach * nx
      this.vy[i] += approach * ny
      this.vx[j] -= approach * nx
      this.vy[j] -= approach * ny
      this.collisions++
    }
    const push = (sigma - d) / 2
    this.x[i] -= nx * push
    this.y[i] -= ny * push
    this.x[j] += nx * push
    this.y[j] += ny * push
  }

  step(dt: number): void {
    const r = this.diameter / 2
    let impulse = 0
    for (let i = 0; i < this.n; i++) {
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt
      if (this.x[i] < r) {
        this.x[i] = 2 * r - this.x[i]
        impulse += 2 * this.mass * Math.abs(this.vx[i])
        this.vx[i] = Math.abs(this.vx[i])
      } else if (this.x[i] > this.box - r) {
        this.x[i] = 2 * (this.box - r) - this.x[i]
        impulse += 2 * this.mass * Math.abs(this.vx[i])
        this.vx[i] = -Math.abs(this.vx[i])
      }
      if (this.y[i] < r) {
        this.y[i] = 2 * r - this.y[i]
        impulse += 2 * this.mass * Math.abs(this.vy[i])
        this.vy[i] = Math.abs(this.vy[i])
      } else if (this.y[i] > this.box - r) {
        this.y[i] = 2 * (this.box - r) - this.y[i]
        impulse += 2 * this.mass * Math.abs(this.vy[i])
        this.vy[i] = -Math.abs(this.vy[i])
      }
    }
    this.buildCells()
    const cells = this.cells
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        for (let i = this.cellHead[cy * cells + cx]; i !== -1; i = this.cellNext[i]) {
          // Same cell (pairs once) and four forward neighbours.
          for (let j = this.cellNext[i]; j !== -1; j = this.cellNext[j]) this.collide(i, j)
          for (const [ox, oy] of [[1, 0], [-1, 1], [0, 1], [1, 1]]) {
            const nx = cx + ox
            const ny = cy + oy
            if (nx < 0 || nx >= cells || ny >= cells) continue
            for (let j = this.cellHead[ny * cells + nx]; j !== -1; j = this.cellNext[j]) this.collide(i, j)
          }
        }
      }
    }
    this.time += dt
    this.wallImpulse += impulse
    if (this.time - this.windowStart >= this.pressureWindow) {
      // Pressure in 2D = momentum delivered per unit time per unit wall length.
      this.pressure = this.wallImpulse / ((this.time - this.windowStart) * 4 * this.box)
      this.wallImpulse = 0
      this.windowStart = this.time
    }
  }
}
