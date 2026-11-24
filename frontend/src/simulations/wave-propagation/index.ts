import { WaveString } from '@/physics/models/waveString'
import { clear, drawGrid, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'
import { drawStringProfile } from '../shared/drawing'

const L = 10
const CELLS = 400
const AMPLITUDE = 0.1
const PROBE = L / 2
const Y_SCALE = 10
const isPulse = (v: ParameterValues) => v.excitation === 'pulse'
const isContinuous = (v: ParameterValues) => v.excitation === 'continuous'

function createInstance(values: ParameterValues): SimulationInstance {
  const excitation = choice(values, 'excitation', ['pulse', 'continuous'] as const)
  const c = num(values, 'waveSpeed')
  const courant = num(values, 'courant')
  const frequency = num(values, 'frequency')
  const tau = num(values, 'pulseWidth') / c
  const t0 = 3 * tau
  const s = new WaveString({
    length: L,
    cells: CELLS,
    waveSpeed: c,
    courant,
    damping: num(values, 'damping'),
    left: 'driven',
    right: choice(values, 'rightEnd', ['fixed', 'free', 'open'] as const),
    driveAmplitude: AMPLITUDE,
    driveFrequency: frequency,
    driveSignal: excitation === 'pulse' ? (t) => AMPLITUDE * Math.exp(-(((t - t0) / tau) ** 2)) : undefined,
  })
  const probeIndex = Math.round(PROBE / s.dx)
  let arrival = Number.NaN
  let previous = 0
  let rising = false

  return {
    get time() {
      return s.time
    },
    finished: false,
    step() {
      s.step()
      const now = s.u[probeIndex]
      if (Number.isNaN(arrival) && excitation === 'pulse') {
        if (now > previous) rising = true
        else if (rising && now < previous && previous > 0.5 * AMPLITUDE) arrival = s.time - s.dt
      }
      previous = now
    },
    sample() {
      return [s.u[0], s.u[probeIndex]]
    },
    readouts() {
      return [
        {
          title: 'Wave',
          items: [
            { label: 'Wave speed c', value: c, unit: 'm/s' },
            ...(excitation === 'continuous'
              ? [
                  { label: 'Frequency f', value: frequency, unit: 'Hz' },
                  { label: 'Wavelength λ = c/f', value: c / frequency, unit: 'm' },
                ]
              : [
                  { label: 'Pulse arrival at x = 5 m', value: arrival, unit: 's', description: 'Time the pulse peak reached the probe' },
                  { label: 'Measured speed (5 m ÷ travel time)', value: PROBE / (arrival - t0), unit: 'm/s' },
                ]),
          ],
        },
        {
          title: 'Numerical scheme',
          items: [
            { label: 'Courant number C = cΔt/Δx', value: courant, unit: '' },
            { label: 'Grid spacing Δx', value: s.dx, unit: 'm' },
            { label: 'Timestep Δt', value: s.dt, unit: 's' },
          ],
        },
      ]
    },
    notices() {
      const n: string[] = []
      if (courant > 1) n.push('C > 1 violates the CFL stability condition: the numerical solution grows without bound. This is a property of the method, not of waves.')
      else if (courant < 1) n.push('C < 1: the grid slightly slows short wavelengths (numerical dispersion), so sharp pulses develop small ripples.')
      n.push('Watch the reflection: inverted at a fixed end, upright at a free end, and none at the open (absorbing) end.')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport({ xMin: -0.3, xMax: L + 0.3, yMin: -2.2, yMax: 2.2 }, width, height)
      drawGrid(ctx, vp, palette)
      drawStringProfile(ctx, vp, s, palette, Y_SCALE)
      ctx.strokeStyle = palette.force
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(vp.toX(PROBE), vp.toY(-1.6))
      ctx.lineTo(vp.toX(PROBE), vp.toY(1.6))
      ctx.stroke()
      ctx.setLineDash([])
      drawLabel(ctx, 'probe', vp.toX(PROBE) + 4, vp.toY(1.5), palette.force)
      drawLabel(ctx, `vertical scale ×${Y_SCALE}`, 8, 18, palette.gridLabel)
    },
  }
}

export const wavePropagationSimulation: SimulationDefinition = {
  id: 'wave-propagation',
  dt: 1e-3,
  timestep: (v) => (num(v, 'courant') * (L / CELLS)) / num(v, 'waveSpeed'),
  canvasDescription: 'A string seen from the side, with waves travelling from the driven left end and reflecting at the right end.',
  parameters: [
    { kind: 'choice', key: 'excitation', label: 'Excitation', defaultValue: 'pulse', options: [{ value: 'pulse', label: 'Single pulse' }, { value: 'continuous', label: 'Continuous sine wave' }] },
    { kind: 'number', key: 'waveSpeed', label: 'Wave speed c', unit: 'm/s', min: 1, max: 20, step: 0.5, defaultValue: 5 },
    { kind: 'number', key: 'pulseWidth', label: 'Pulse width', unit: 'm', min: 0.2, max: 2, step: 0.05, defaultValue: 0.5, visibleWhen: isPulse },
    { kind: 'number', key: 'frequency', label: 'Frequency f', unit: 'Hz', min: 0.1, max: 5, step: 0.05, defaultValue: 1, visibleWhen: isContinuous },
    { kind: 'choice', key: 'rightEnd', label: 'Right end', defaultValue: 'fixed', options: [{ value: 'fixed', label: 'Fixed' }, { value: 'free', label: 'Free' }, { value: 'open', label: 'Open (absorbing)' }] },
    { kind: 'number', key: 'damping', label: 'Damping γ', unit: '1/s', min: 0, max: 2, step: 0.05, defaultValue: 0 },
    { kind: 'number', key: 'courant', label: 'Courant number C', unit: '', min: 0.3, max: 1.1, step: 0.01, defaultValue: 0.95, description: 'Numerical parameter. Stable for C ≤ 1.' },
  ],
  equations: [
    { label: 'Wave equation', expression: '∂²u/∂t² = c² ∂²u/∂x² − γ ∂u/∂t' },
    { label: 'Travelling wave', expression: 'u(x, t) = f(x − ct)' },
    { label: 'Sine wave', expression: 'v = f λ' },
    { label: 'Scheme (leapfrog)', expression: 'uᵢⁿ⁺¹ = 2uᵢⁿ − uᵢⁿ⁻¹ + C² (uᵢ₊₁ⁿ − 2uᵢⁿ + uᵢ₋₁ⁿ)' },
    { label: 'Stability (CFL)', expression: 'C = c Δt / Δx ≤ 1' },
  ],
  sampleInterval: () => 0.01,
  channels: [
    { key: 'source', label: 'Displacement at the driven end', unit: 'm' },
    { key: 'probe', label: 'Displacement at x = 5 m', unit: 'm' },
  ],
  charts: [{ id: 'displacement', title: 'Displacement', unit: 'm', series: [{ key: 'source', color: 'force' }, { key: 'probe', color: 'position' }] }],
  create: createInstance,
}
