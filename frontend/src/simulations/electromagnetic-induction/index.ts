import { dipoleFlux, inducedEmf } from '@/physics/models/induction'
import { clear, drawArrow, drawLabel, LABEL_FONT } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { bool, choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'

const isPass = (v: ParameterValues) => v.motion === 'pass'
const isOscillate = (v: ParameterValues) => v.motion === 'oscillate'

function createInstance(values: ParameterValues): SimulationInstance {
  const motion = choice(values, 'motion', ['pass', 'oscillate'] as const)
  const N = num(values, 'turns')
  const a = num(values, 'radius') / 100
  const m = num(values, 'moment') * (bool(values, 'flip') ? -1 : 1)
  const R = num(values, 'resistance')
  const v0 = num(values, 'speed')
  const A = num(values, 'amplitude') / 100
  const w = 2 * Math.PI * num(values, 'frequency')
  const start = -6 * a
  const duration = (12 * a) / v0
  let time = 0
  let dissipated = 0
  const position = (t: number) => (motion === 'pass' ? start + v0 * t : A * Math.cos(w * t))
  const velocity = (t: number) => (motion === 'pass' ? v0 : -A * w * Math.sin(w * t))
  const emf = (t: number) => inducedEmf(N, m, a, position(t), velocity(t))
  const peakEmf = Math.abs(inducedEmf(N, Math.abs(m), a, a / 2, motion === 'pass' ? v0 : A * w))

  return {
    get time() {
      return time
    },
    get finished() {
      return motion === 'pass' && time >= duration
    },
    step(dt) {
      // Energy dissipated in the coil: ∫ ε²/R dt (midpoint rule).
      const e = emf(time + dt / 2)
      dissipated += (e * e * dt) / R
      time += dt
    },
    sample() {
      const e = emf(time)
      return [position(time) * 100, dipoleFlux(m, a, position(time)) * N * 1e3, e * 1e3, (e / R) * 1e3]
    },
    readouts() {
      const x = position(time)
      const e = emf(time)
      return [
        {
          title: 'Magnet',
          items: [
            { label: 'Position (from coil centre)', value: x * 100, unit: 'cm' },
            { label: 'Velocity', value: velocity(time), unit: 'm/s' },
          ],
        },
        {
          title: 'Coil',
          items: [
            { label: 'Flux linkage NΦ', value: N * dipoleFlux(m, a, x) * 1e3, unit: 'mWb' },
            { label: 'Induced EMF ε = −N dΦ/dt', value: e * 1e3, unit: 'mV' },
            { label: 'Current I = ε/R', value: (e / R) * 1e3, unit: 'mA' },
            { label: 'Peak EMF (theory, at x = a/2)', value: peakEmf * 1e3, unit: 'mV', description: 'For a pass, |ε| is largest when the magnet is half a coil radius from the centre.' },
            { label: 'Energy dissipated ∫ε²/R dt', value: dissipated * 1e6, unit: 'µJ' },
          ],
        },
      ]
    },
    notices() {
      return [
        'The magnet’s motion is prescribed. In reality the induced current pushes back on the magnet (Lenz’s law) and slows it; that force, and the coil’s self-inductance, are neglected here.',
        'The EMF changes sign as the magnet passes the centre: the flux rises, then falls, so ∫ε dt over a full pass is zero.',
      ]
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const span = Math.max(6.5 * a, motion === 'oscillate' ? 1.3 * A : 0)
      const vp = fitViewport({ xMin: -span, xMax: span, yMin: -2.2 * a, yMax: 2.6 * a }, width, height)
      const x = position(time)
      // Dipole field lines r = C sin²θ (exact for a point dipole), drawn around the magnet.
      ctx.save()
      ctx.strokeStyle = palette.grid
      ctx.lineWidth = 1
      for (const C of [0.6, 1.2, 2, 3.2].map((k) => k * a)) {
        for (const side of [1, -1]) {
          ctx.beginPath()
          for (let i = 1; i < 200; i++) {
            const th = (Math.PI * i) / 200
            const r = C * Math.sin(th) ** 2
            const px = vp.toX(x + r * Math.cos(th))
            const py = vp.toY(side * r * Math.sin(th))
            if (i === 1) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.stroke()
        }
      }
      ctx.restore()
      // Coil: turns as ellipses around x = 0
      ctx.strokeStyle = palette.force
      ctx.lineWidth = 1.5
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath()
        ctx.ellipse(vp.toX(k * 0.12 * a), vp.toY(0), 0.25 * a * vp.scale, a * vp.scale, 0, 0, 2 * Math.PI)
        ctx.stroke()
      }
      // Magnet
      const len = 1.2 * a
      const h = 0.45 * a
      const north = m >= 0 ? 1 : -1
      ctx.fillStyle = palette.momentum
      ctx.fillRect(vp.toX(x + (north > 0 ? 0 : -len / 2)), vp.toY(h / 2), (len / 2) * vp.scale, h * vp.scale)
      ctx.fillStyle = palette.position
      ctx.fillRect(vp.toX(x + (north > 0 ? -len / 2 : 0)), vp.toY(h / 2), (len / 2) * vp.scale, h * vp.scale)
      ctx.font = LABEL_FONT
      drawLabel(ctx, 'N', vp.toX(x + (north * len) / 4) - 4, vp.toY(0) + 4, palette.background)
      drawLabel(ctx, 'S', vp.toX(x - (north * len) / 4) - 4, vp.toY(0) + 4, palette.background)
      // Galvanometer needle
      const e = emf(time)
      const gx = vp.toX(span * 0.75)
      const gy = vp.toY(2.0 * a)
      ctx.strokeStyle = palette.muted
      ctx.beginPath()
      ctx.arc(gx, gy, 34, Math.PI, 2 * Math.PI)
      ctx.stroke()
      const angle = Math.PI * 1.5 + Math.max(-1, Math.min(1, e / (peakEmf || 1))) * (Math.PI / 2.2)
      drawArrow(ctx, gx, gy, gx + 30 * Math.cos(angle), gy + 30 * Math.sin(angle), palette.energy)
      drawLabel(ctx, `ε = ${(e * 1000).toFixed(2)} mV`, gx - 40, gy + 18, palette.energy)
      drawLabel(ctx, `${N} turns, radius ${(a * 100).toFixed(1)} cm`, vp.toX(-0.5 * a), vp.toY(-1.3 * a), palette.force)
    },
  }
}

export const inductionSimulation: SimulationDefinition = {
  id: 'electromagnetic-induction',
  dt: 1e-4,
  canvasDescription: 'A bar magnet moving along the axis of a coil, with the dipole field lines and a meter showing the induced EMF.',
  clock: () => ({ unit: 's', secondsPerUnit: 1, unitsPerRealSecond: 0.25 }),
  parameters: [
    { kind: 'choice', key: 'motion', label: 'Magnet motion', defaultValue: 'pass', options: [{ value: 'pass', label: 'Pass through at constant speed' }, { value: 'oscillate', label: 'Oscillate through the coil' }] },
    { kind: 'number', key: 'speed', label: 'Magnet speed', unit: 'm/s', min: 0.05, max: 5, step: 0.05, defaultValue: 0.5, visibleWhen: isPass },
    { kind: 'number', key: 'amplitude', label: 'Oscillation amplitude', unit: 'cm', min: 1, max: 20, step: 0.5, defaultValue: 6, visibleWhen: isOscillate },
    { kind: 'number', key: 'frequency', label: 'Oscillation frequency', unit: 'Hz', min: 0.1, max: 5, step: 0.1, defaultValue: 1, visibleWhen: isOscillate },
    { kind: 'number', key: 'turns', label: 'Turns N', unit: '', min: 1, max: 2000, step: 1, defaultValue: 200 },
    { kind: 'number', key: 'radius', label: 'Coil radius a', unit: 'cm', min: 0.5, max: 10, step: 0.1, defaultValue: 2 },
    { kind: 'number', key: 'moment', label: 'Magnetic moment m', unit: 'A·m²', min: 0.05, max: 5, step: 0.05, defaultValue: 1, description: 'About 1 A·m² for a 1 cm neodymium cube.' },
    { kind: 'number', key: 'resistance', label: 'Coil resistance R', unit: 'Ω', min: 0.1, max: 100, step: 0.1, defaultValue: 5 },
    { kind: 'boolean', key: 'flip', label: 'Flip the magnet (reverse N and S)', defaultValue: false },
  ],
  equations: [
    { label: 'Faraday’s law', expression: 'ε = −N dΦ/dt' },
    { label: 'Dipole flux through a coaxial loop', expression: 'Φ = μ₀ m a² / (2 (a² + x²)^{3/2})' },
    { label: 'Moving magnet', expression: 'dΦ/dt = (dΦ/dx) · v' },
    { label: 'Ohm’s law', expression: 'I = ε / R' },
  ],
  sampleInterval: () => 0.002,
  channels: [
    { key: 'x', label: 'Magnet position', unit: 'cm' },
    { key: 'linkage', label: 'Flux linkage NΦ', unit: 'mWb' },
    { key: 'emf', label: 'Induced EMF', unit: 'mV' },
    { key: 'current', label: 'Current', unit: 'mA' },
  ],
  charts: [
    { id: 'emf', title: 'EMF', unit: 'mV', series: [{ key: 'emf', color: 'energy' }] },
    { id: 'flux', title: 'Flux linkage', unit: 'mWb', series: [{ key: 'linkage', color: 'position' }] },
    { id: 'current', title: 'Current', unit: 'mA', series: [{ key: 'current', color: 'velocity' }] },
  ],
  create: createInstance,
}
