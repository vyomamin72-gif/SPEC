export interface InterferenceParams {
  /** Wavelength λ, m. */
  wavelength: number
  /** Source separation d, m (sources at y = ±d/2 on x = 0). */
  separation: number
  /** Phase of source 2 relative to source 1, rad. */
  phaseDifference: number
  /** Include 1/√r amplitude decay of circular (2D) waves. */
  decay: boolean
  /** Wave speed, m/s (sets the frequency f = v/λ for animation only). */
  waveSpeed: number
}

function sourceAmplitude(r: number, decay: boolean): number {
  return decay ? 1 / Math.sqrt(Math.max(r, 1e-6)) : 1
}

/**
 * Superposition of two coherent point sources of linear waves, exact for
 * linear waves: u = Σ aᵢ(rᵢ) cos(k rᵢ − ωt + φᵢ). Returns the instantaneous
 * displacement at (x, y) and time t.
 */
export function displacement(p: InterferenceParams, x: number, y: number, t: number): number {
  const k = (2 * Math.PI) / p.wavelength
  const w = (2 * Math.PI * p.waveSpeed) / p.wavelength
  const r1 = Math.hypot(x, y - p.separation / 2)
  const r2 = Math.hypot(x, y + p.separation / 2)
  return sourceAmplitude(r1, p.decay) * Math.cos(k * r1 - w * t) + sourceAmplitude(r2, p.decay) * Math.cos(k * r2 - w * t + p.phaseDifference)
}

/** Time-averaged intensity ∝ a₁² + a₂² + 2a₁a₂ cos(k(r₁ − r₂) − Δφ) (halved for the cos² average). */
export function intensity(p: InterferenceParams, x: number, y: number): number {
  const k = (2 * Math.PI) / p.wavelength
  const r1 = Math.hypot(x, y - p.separation / 2)
  const r2 = Math.hypot(x, y + p.separation / 2)
  const a1 = sourceAmplitude(r1, p.decay)
  const a2 = sourceAmplitude(r2, p.decay)
  return 0.5 * (a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(k * (r1 - r2) - p.phaseDifference))
}

/** Positions of intensity maxima along the screen x = D, |y| ≤ halfWidth, located by sampling + parabolic refinement. */
export function screenMaxima(p: InterferenceParams, screenDistance: number, halfWidth: number, samples = 4000): number[] {
  const ys = Array.from({ length: samples + 1 }, (_, i) => -halfWidth + (2 * halfWidth * i) / samples)
  const I = ys.map((y) => intensity(p, screenDistance, y))
  const h = ys[1] - ys[0]
  const maxima: number[] = []
  for (let i = 1; i < samples; i++) {
    if (I[i] > I[i - 1] && I[i] >= I[i + 1]) {
      const denom = I[i - 1] - 2 * I[i] + I[i + 1]
      maxima.push(ys[i] + (denom !== 0 ? (0.5 * h * (I[i - 1] - I[i + 1])) / denom : 0))
    }
  }
  return maxima
}
