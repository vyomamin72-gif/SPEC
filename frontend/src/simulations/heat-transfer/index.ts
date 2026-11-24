import { HeatRod } from '@/physics/models/heat'
import { clear, drawLabel, LABEL_FONT } from '@/rendering/draw'
import { choice, num } from '../types'
import type { ParameterValues, SimulationClock, SimulationDefinition, SimulationInstance } from '../types'

const L = 0.5
const CELLS = 100
/** Thermal diffusivity (m²/s) and conductivity (W/m·K) near room temperature (handbook values, rounded). */
const MATERIALS = {
  copper: { label: 'Copper', alpha: 1.11e-4, k: 401 },
  aluminium: { label: 'Aluminium', alpha: 9.7e-5, k: 237 },
  steel: { label: 'Stainless steel', alpha: 4.2e-6, k: 16 },
  glass: { label: 'Glass', alpha: 3.4e-7, k: 1.0 },
} as const
type Material = keyof typeof MATERIALS
const MATERIAL_KEYS = Object.keys(MATERIALS) as Material[]

function clock(v: ParameterValues): SimulationClock {
  // Show one diffusion time L²/α in about 20 real seconds at 1×.
  const perSecond = L ** 2 / MATERIALS[v.material as Material].alpha / 20
  return perSecond < 3600 ? { unit: 'min', secondsPerUnit: 60, unitsPerRealSecond: perSecond / 60 } : { unit: 'h', secondsPerUnit: 3600, unitsPerRealSecond: perSecond / 3600 }
}

function heatColor(t: number, lo: number, hi: number): string {
  const f = Math.min(1, Math.max(0, (t - lo) / Math.max(hi - lo, 1e-9)))
  // Cold blue → warm orange (Okabe–Ito ends), interpolated.
  const c0 = [86, 180, 233]
  const c1 = [230, 159, 0]
  const c = c0.map((v, i) => Math.round(v + (c1[i] - v) * f))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function createInstance(values: ParameterValues): SimulationInstance {
  const material = MATERIALS[choice(values, 'material', MATERIAL_KEYS)]
  const initial = choice(values, 'initial', ['uniform', 'step', 'sine'] as const)
  const t0 = num(values, 'initialTemperature')
  let left = num(values, 'leftTemperature')
  let right = num(values, 'rightTemperature')
  const rod = new HeatRod({
    length: L,
    cells: CELLS,
    diffusivity: material.alpha,
    conductivity: material.k,
    r: num(values, 'r'),
    leftTemperature: left,
    rightTemperature: right,
    initial: (x) => (initial === 'uniform' ? t0 : initial === 'step' ? (x < L / 2 ? t0 + 50 : t0) : t0 + 50 * Math.sin((Math.PI * x) / L)),
  })
  const tau = L ** 2 / (Math.PI ** 2 * material.alpha)
  let endsConstant = true
  // Exact continuum solution at the midpoint for a sine start between equal ends.
  const sineTheory = () => (initial === 'sine' && endsConstant && left === t0 && right === t0 ? t0 + 50 * Math.exp(-rod.time / tau) : Number.NaN)
  const lo = () => Math.min(...rod.T, left, right)
  const hi = () => Math.max(...rod.T, left, right)

  return {
    get time() {
      return rod.time
    },
    finished: false,
    step: () => rod.step(),
    update(next) {
      const l = num(next, 'leftTemperature')
      const r = num(next, 'rightTemperature')
      if (l !== left || r !== right) endsConstant = false
      left = l
      right = r
      rod.setEndTemperatures(l, r)
    },
    sample() {
      return [rod.at(L / 4), rod.at(L / 2), rod.at((3 * L) / 4), sineTheory(), rod.steadyState(L / 2)]
    },
    readouts() {
      const stable = rod.params.r <= 0.5
      return [
        {
          title: material.label,
          items: [
            { label: 'Thermal diffusivity α', value: material.alpha, unit: 'm²/s' },
            { label: 'Conductivity k', value: material.k, unit: 'W/(m·K)' },
            { label: 'Slowest decay time L²/(π²α)', value: tau / 60, unit: 'min' },
          ],
        },
        {
          title: 'Rod',
          items: [
            { label: 'Temperature at the middle', value: rod.at(L / 2), unit: '°C' },
            { label: 'Steady state at the middle', value: rod.steadyState(L / 2), unit: '°C' },
            { label: 'Exact solution at the middle (sine start)', value: sineTheory(), unit: '°C' },
            { label: 'Heat flux in at the left end', value: rod.leftFlux(), unit: 'W/m²' },
            { label: 'Steady-state flux k(T_L − T_R)/L', value: (material.k * (left - right)) / L, unit: 'W/m²' },
          ],
        },
        {
          title: 'Numerical scheme',
          items: [
            { label: 'r = αΔt/Δx²', value: rod.params.r, unit: '' },
            { label: 'Stability', text: stable ? 'stable (r ≤ ½)' : 'UNSTABLE (r > ½)', unit: '' },
            { label: 'Timestep Δt', value: rod.dt, unit: 's' },
          ],
        },
      ]
    },
    notices() {
      const n = ['Heat flows only along the rod: its sides are perfectly insulated. Material properties are constant.']
      if (rod.params.r > 0.5) n.push('r > ½ breaks the stability condition of this explicit scheme: errors grow every step into a saw-tooth. This is a numerical failure, not physics.')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const leftPx = 60
      const rightPx = width - 20
      const top = 24
      const bottom = height - 90
      const tLo = Math.min(lo(), 0)
      const tHi = Math.max(hi(), 100)
      const X = (x: number) => leftPx + ((rightPx - leftPx) * x) / L
      const Y = (t: number) => bottom - ((bottom - top) * (t - tLo)) / (tHi - tLo)
      ctx.strokeStyle = palette.grid
      ctx.strokeRect(leftPx, top, rightPx - leftPx, bottom - top)
      ctx.font = LABEL_FONT
      for (const t of [tLo, (tLo + tHi) / 2, tHi]) drawLabel(ctx, `${t.toFixed(0)} °C`, 6, Y(t) + 4, palette.gridLabel)
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = palette.theory
      ctx.beginPath()
      ctx.moveTo(X(0), Y(rod.steadyState(0)))
      ctx.lineTo(X(L), Y(rod.steadyState(L)))
      ctx.stroke()
      ctx.restore()
      ctx.strokeStyle = palette.force
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < rod.n; i++) {
        const py = Math.max(top - 40, Math.min(bottom + 40, Y(rod.T[i])))
        if (i === 0) ctx.moveTo(X(rod.x[i]), py)
        else ctx.lineTo(X(rod.x[i]), py)
      }
      ctx.stroke()
      // The rod, coloured by temperature
      const barTop = bottom + 30
      for (let i = 0; i < rod.n - 1; i++) {
        ctx.fillStyle = heatColor(rod.T[i], tLo, tHi)
        ctx.fillRect(X(rod.x[i]), barTop, X(rod.x[i + 1]) - X(rod.x[i]) + 1, 26)
      }
      drawLabel(ctx, `${left} °C`, leftPx - 10, barTop + 44, palette.ink)
      drawLabel(ctx, `${right} °C`, rightPx - 40, barTop + 44, palette.ink)
      drawLabel(ctx, 'temperature profile · dashed: steady state', leftPx + 6, top + 16, palette.gridLabel)
      drawLabel(ctx, `${L * 100} cm rod`, (leftPx + rightPx) / 2 - 24, barTop + 44, palette.gridLabel)
    },
  }
}

export const heatTransferSimulation: SimulationDefinition = {
  id: 'heat-transfer',
  dt: 0.1,
  timestep: (v) => (num(v, 'r') * (L / CELLS) ** 2) / MATERIALS[v.material as Material].alpha,
  clock,
  canvasDescription: 'Temperature along a metal rod plotted against position, above the rod coloured from cold blue to hot orange.',
  parameters: [
    { kind: 'choice', key: 'material', label: 'Material', defaultValue: 'copper', options: MATERIAL_KEYS.map((k) => ({ value: k, label: MATERIALS[k].label })) },
    { kind: 'choice', key: 'initial', label: 'Initial temperature', defaultValue: 'uniform', options: [{ value: 'uniform', label: 'Uniform' }, { value: 'step', label: 'Left half 50 °C hotter' }, { value: 'sine', label: 'Sine bump (+50 °C)' }] },
    { kind: 'number', key: 'initialTemperature', label: 'Initial rod temperature', unit: '°C', min: -20, max: 100, step: 1, defaultValue: 20 },
    { kind: 'number', key: 'leftTemperature', label: 'Left end held at', unit: '°C', min: -20, max: 200, step: 1, defaultValue: 100, live: true },
    { kind: 'number', key: 'rightTemperature', label: 'Right end held at', unit: '°C', min: -20, max: 200, step: 1, defaultValue: 20, live: true },
    { kind: 'number', key: 'r', label: 'Diffusion number r', unit: '', min: 0.05, max: 0.6, step: 0.01, defaultValue: 0.4, description: 'Numerical parameter αΔt/Δx². Stable only for r ≤ 0.5.' },
  ],
  equations: [
    { label: 'Heat equation', expression: '∂T/∂t = α ∂²T/∂x²,  α = k / (ρ c)' },
    { label: 'Fourier’s law', expression: 'q = −k ∂T/∂x' },
    { label: 'Steady state', expression: 'T(x) = T_L + (T_R − T_L) x / L' },
    { label: 'Scheme (FTCS)', expression: 'Tᵢⁿ⁺¹ = Tᵢⁿ + r (Tᵢ₊₁ⁿ − 2Tᵢⁿ + Tᵢ₋₁ⁿ)' },
  ],
  sampleInterval: (v) => (L ** 2 / MATERIALS[v.material as Material].alpha) / 400,
  channels: [
    { key: 'quarter', label: 'T at x = L/4', unit: '°C' },
    { key: 'middle', label: 'T at x = L/2', unit: '°C' },
    { key: 'threeQuarter', label: 'T at x = 3L/4', unit: '°C' },
    { key: 'middleExact', label: 'T at x = L/2, exact (sine start)', unit: '°C' },
    { key: 'middleSteady', label: 'Steady state at x = L/2', unit: '°C' },
  ],
  charts: [
    {
      id: 'temperatures', title: 'Temperatures', unit: '°C',
      series: [{ key: 'quarter', color: 'force' }, { key: 'middle', color: 'energy' }, { key: 'threeQuarter', color: 'position' }, { key: 'middleExact', color: 'theory', theory: true }, { key: 'middleSteady', color: 'muted' }],
    },
  ],
  create: createInstance,
}
