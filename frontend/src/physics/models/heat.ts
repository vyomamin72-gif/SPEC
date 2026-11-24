export type HeatInitial = 'uniform' | 'step' | 'sine'

export interface HeatParams {
  /** Rod length, m. */
  length: number
  cells: number
  /** Thermal diffusivity α = k/(ρc), m²/s. */
  diffusivity: number
  /** Thermal conductivity k, W/(m·K) (for heat flux readouts only). */
  conductivity: number
  /** Diffusion number r = αΔt/Δx². The explicit scheme is stable only for r ≤ ½. */
  r: number
  leftTemperature: number
  rightTemperature: number
  initial: (x: number) => number
}

/**
 * One-dimensional heat equation ∂T/∂t = α ∂²T/∂x² with fixed end
 * temperatures, solved by the explicit FTCS scheme
 *   Tᵢⁿ⁺¹ = Tᵢⁿ + r (Tᵢ₊₁ⁿ − 2Tᵢⁿ + Tᵢ₋₁ⁿ),  r = αΔt/Δx².
 * First order in time, second order in space; stable only for r ≤ ½.
 */
export class HeatRod {
  readonly params: HeatParams
  readonly n: number
  readonly dx: number
  readonly dt: number
  readonly x: Float64Array
  T: Float64Array
  private next: Float64Array
  time = 0
  readonly finished = false

  constructor(params: HeatParams) {
    this.params = params
    this.n = params.cells + 1
    this.dx = params.length / params.cells
    this.dt = (params.r * this.dx * this.dx) / params.diffusivity
    this.x = Float64Array.from({ length: this.n }, (_, i) => i * this.dx)
    this.T = Float64Array.from(this.x, (x) => params.initial(x))
    this.T[0] = params.leftTemperature
    this.T[this.n - 1] = params.rightTemperature
    this.next = new Float64Array(this.n)
  }

  step(dt: number = this.dt): void {
    if (Math.abs(dt - this.dt) > 1e-12 * this.dt) throw new RangeError('HeatRod must be stepped with its own dt')
    const r = this.params.r
    const { T, next, n } = this
    for (let i = 1; i < n - 1; i++) next[i] = T[i] + r * (T[i + 1] - 2 * T[i] + T[i - 1])
    next[0] = this.params.leftTemperature
    next[n - 1] = this.params.rightTemperature
    this.next = T
    this.T = next
    this.time += this.dt
  }

  /** Change the fixed end temperatures (e.g. touch the rod to a different reservoir). */
  setEndTemperatures(left: number, right: number): void {
    this.params.leftTemperature = left
    this.params.rightTemperature = right
  }

  /** Steady state: a straight line between the end temperatures. */
  steadyState(x: number): number {
    const { leftTemperature: a, rightTemperature: b, length } = this.params
    return a + ((b - a) * x) / length
  }

  /** Heat flux into the rod at the left end, −k ∂T/∂x, W/m² (one-sided difference). */
  leftFlux(): number {
    return (-this.params.conductivity * (this.T[1] - this.T[0])) / this.dx
  }

  /** Temperature at x, by linear interpolation. */
  at(x: number): number {
    const s = Math.min(Math.max(x / this.dx, 0), this.n - 1)
    const i = Math.min(Math.floor(s), this.n - 2)
    const f = s - i
    return (1 - f) * this.T[i] + f * this.T[i + 1]
  }
}

/** Per-step amplification of mode n under FTCS: 1 − 4r sin²(kΔx/2), k = nπ/L. */
export function ftcsModeFactor(n: number, r: number, dx: number, length: number): number {
  return 1 - 4 * r * Math.sin((n * Math.PI * dx) / (2 * length)) ** 2
}
