export type Boundary = 'fixed' | 'free' | 'open' | 'driven'

export interface WaveStringParams {
  /** m */
  length: number
  /** Number of cells; the grid has cells + 1 nodes. */
  cells: number
  /** Wave speed c, m/s. */
  waveSpeed: number
  /** Courant number C = c·Δt/Δx. Stable for C ≤ 1; exact (d'Alembert) at C = 1 without damping. */
  courant: number
  /** Damping rate γ in u_tt + γ u_t = c² u_xx, 1/s. */
  damping: number
  left: Boundary
  right: Exclude<Boundary, 'driven'>
  /** Driven-end displacement amplitude, m, and frequency, Hz. */
  driveAmplitude?: number
  driveFrequency?: number
  /** Initial displacement u(x, 0); the initial velocity is zero. */
  initial?: (x: number) => number
  /** Custom driven-end displacement u(0, t), m; overrides the sinusoid. */
  driveSignal?: (t: number) => number
  /**
   * Smoothly ramp the sinusoidal drive up over this time, s. An abrupt start
   * has a kink that the grid cannot resolve, which shows up as spurious
   * high-frequency ringing (numerical dispersion).
   */
  driveRampTime?: number
}

/**
 * The 1D wave equation u_tt + γu_t = c² u_xx solved by the explicit
 * centred (leapfrog) finite-difference scheme
 *   u_i^{n+1} = [2u_i^n − (1 − γΔt/2)u_i^{n−1} + C²(u_{i+1}^n − 2u_i^n + u_{i−1}^n)] / (1 + γΔt/2).
 * Stable only for C ≤ 1 (the CFL condition). Boundaries: fixed (u = 0),
 * free (∂u/∂x = 0), open (first-order Mur absorbing condition: transmits
 * waves leaving the grid, exactly at normal incidence when C = 1), or driven
 * (prescribed u = A sin 2πft).
 */
export class WaveString {
  readonly params: WaveStringParams
  readonly n: number
  readonly dx: number
  readonly dt: number
  readonly x: Float64Array
  /** Displacement at the current time level. */
  u: Float64Array
  private prev: Float64Array
  private next: Float64Array
  time = 0
  readonly finished = false
  private driveFrequency: number
  /** Accumulated drive phase, so frequency changes do not make the end jump. */
  private drivePhase = 0

  constructor(params: WaveStringParams) {
    this.params = params
    this.driveFrequency = params.driveFrequency ?? 0
    this.n = params.cells + 1
    this.dx = params.length / params.cells
    this.dt = (params.courant * this.dx) / params.waveSpeed
    this.x = Float64Array.from({ length: this.n }, (_, i) => i * this.dx)
    this.u = Float64Array.from(this.x, (x) => params.initial?.(x) ?? 0)
    this.applyStaticBoundary(this.u)
    // Zero initial velocity: u^{-1} = u^0 + ½C²Δ²u^0 (second-order accurate;
    // at C = 1 this reproduces d'Alembert's solution exactly).
    const C2 = params.courant ** 2
    this.prev = new Float64Array(this.n)
    for (let i = 0; i < this.n; i++) {
      const left = i > 0 ? this.u[i - 1] : this.u[1] // mirror for free ends
      const right = i < this.n - 1 ? this.u[i + 1] : this.u[this.n - 2]
      this.prev[i] = this.u[i] + 0.5 * C2 * (left - 2 * this.u[i] + right)
    }
    this.applyStaticBoundary(this.prev)
    this.next = new Float64Array(this.n)
  }

  private applyStaticBoundary(a: Float64Array): void {
    if (this.params.left === 'fixed' || this.params.left === 'driven') a[0] = 0
    if (this.params.right === 'fixed') a[this.n - 1] = 0
  }

  /** Change the drive frequency (Hz) without a jump in the driven end's displacement. */
  setDriveFrequency(frequency: number): void {
    this.driveFrequency = frequency
  }

  get currentDriveFrequency(): number {
    return this.driveFrequency
  }

  private nextDriveValue(): number {
    if (this.params.driveSignal) return this.params.driveSignal(this.time + this.dt)
    this.drivePhase += 2 * Math.PI * this.driveFrequency * this.dt
    const ramp = this.params.driveRampTime ?? 0
    const t = this.time + this.dt
    const envelope = ramp > 0 && t < ramp ? 0.5 - 0.5 * Math.cos((Math.PI * t) / ramp) : 1
    return (this.params.driveAmplitude ?? 0) * envelope * Math.sin(this.drivePhase)
  }

  /** Advance one timestep. `dt` must be this model's own Δt (set by the Courant number). */
  step(dt: number = this.dt): void {
    if (Math.abs(dt - this.dt) > 1e-12 * this.dt) throw new RangeError('WaveString must be stepped with its own dt')
    const { u, prev, next, n } = this
    const C2 = this.params.courant ** 2
    const g = (this.params.damping * this.dt) / 2
    for (let i = 1; i < n - 1; i++) {
      next[i] = (2 * u[i] - (1 - g) * prev[i] + C2 * (u[i + 1] - 2 * u[i] + u[i - 1])) / (1 + g)
    }
    const C = this.params.courant
    const mur = (C - 1) / (C + 1)
    const edge = (b: Boundary, i: number, inner: number) => {
      switch (b) {
        case 'fixed':
          next[i] = 0
          break
        case 'driven':
          next[i] = this.nextDriveValue()
          break
        case 'free':
          next[i] = (2 * u[i] - (1 - g) * prev[i] + C2 * 2 * (u[inner] - u[i])) / (1 + g)
          break
        case 'open':
          next[i] = u[inner] + mur * (next[inner] - u[i])
          break
      }
    }
    edge(this.params.left, 0, 1)
    edge(this.params.right, n - 1, n - 2)
    this.prev = u
    this.u = next
    this.next = prev
    this.time += this.dt
  }

  /** Transverse velocity estimate (u^n − u^{n−1})/Δt at node i. */
  velocity(i: number): number {
    return (this.u[i] - this.prev[i]) / this.dt
  }

  /** Interpolated displacement at position x. */
  displacementAt(x: number): number {
    const s = Math.min(Math.max(x / this.dx, 0), this.n - 1)
    const i = Math.min(Math.floor(s), this.n - 2)
    const f = s - i
    return (1 - f) * this.u[i] + f * this.u[i + 1]
  }
}

/** Mode-n frequency of a fixed–fixed string in the continuum: fₙ = n c / (2L). */
export function modeFrequency(n: number, waveSpeed: number, length: number): number {
  return (n * waveSpeed) / (2 * length)
}

/**
 * Mode-n frequency predicted for the discrete leapfrog grid (numerical
 * dispersion): sin(ωΔt/2) = C sin(kΔx/2), k = nπ/L. Equal to the continuum
 * value at C = 1 and slightly lower for C < 1.
 */
export function gridModeFrequency(n: number, s: Pick<WaveString, 'dx' | 'dt'> & { params: Pick<WaveStringParams, 'courant' | 'length'> }): number {
  const k = (n * Math.PI) / s.params.length
  return ((2 / s.dt) * Math.asin(s.params.courant * Math.sin((k * s.dx) / 2))) / (2 * Math.PI)
}
