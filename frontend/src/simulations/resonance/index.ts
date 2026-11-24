import { exactDisplacement, OscillatorModel, phaseLag, steadyAmplitude } from '@/physics/models/oscillator'
import { clear, drawDisc, drawLabel, LABEL_FONT } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'
import { drawSpring } from '../shared/drawing'

/** Measured (ω, amplitude) points survive restarts while m, k, b, F₀ stay the same. */
const measured: { key: string; points: { omega: number; amplitude: number }[] } = { key: '', points: [] }

function createInstance(values: ParameterValues): SimulationInstance {
  const p = {
    mass: num(values, 'mass'),
    stiffness: num(values, 'stiffness'),
    damping: num(values, 'damping'),
    initialDisplacement: 0,
    driveAmplitude: num(values, 'driveForce'),
    driveFrequency: num(values, 'driveOmega'),
    integrator: 'rk4' as const,
  }
  const key = [p.mass, p.stiffness, p.damping, p.driveAmplitude].join('|')
  if (measured.key !== key) {
    measured.key = key
    measured.points = []
  }
  const model = new OscillatorModel(p)
  const omega0 = Math.sqrt(p.stiffness / p.mass)
  const gamma = p.damping / p.mass
  const omegaMax = 2.5 * omega0
  const peakOmega = Math.sqrt(Math.max(omega0 ** 2 - gamma ** 2 / 2, 0))
  const peakAmplitude = steadyAmplitude(p, peakOmega || 1e-9)
  let driveConstant = true

  const recordIfSettled = () => {
    const a = model.settledAmplitude
    const w = model.parameters.driveFrequency
    if (Number.isNaN(a) || model.time - model.driveChangedAt < 8 / Math.max(gamma, 1e-6)) return
    if (!measured.points.some((pt) => Math.abs(pt.omega - w) < 1e-9)) measured.points.push({ omega: w, amplitude: a })
  }

  return {
    get time() {
      return model.time
    },
    finished: false,
    step(dt) {
      model.step(dt)
      recordIfSettled()
    },
    update(next) {
      const w = num(next, 'driveOmega')
      if (w !== model.parameters.driveFrequency) driveConstant = false
      model.setDriveFrequency(w)
    },
    sample() {
      const w = model.parameters.driveFrequency
      return [model.state[0], driveConstant ? exactDisplacement(p, model.time) : Number.NaN, p.driveAmplitude * Math.cos(w * model.time)]
    },
    readouts() {
      const w = model.parameters.driveFrequency
      return [
        {
          title: 'Drive',
          items: [
            { label: 'Natural frequency ω₀ = √(k/m)', value: omega0, unit: 'rad/s' },
            { label: 'Driving frequency ω', value: w, unit: 'rad/s' },
            { label: 'Ratio ω / ω₀', value: w / omega0, unit: '' },
          ],
        },
        {
          title: 'Response',
          items: [
            { label: 'Steady amplitude (measured)', value: model.settledAmplitude, unit: 'm', description: 'Peak |x| per drive period, once two successive periods agree to 0.1 %' },
            { label: 'Steady amplitude (theory)', value: steadyAmplitude(p, w), unit: 'm' },
            { label: 'Phase lag δ (theory)', value: (phaseLag(p, w) * 180) / Math.PI, unit: '°' },
            { label: 'Quality factor Q = ω₀/γ', value: gamma > 0 ? omega0 / gamma : Infinity, unit: '' },
            { label: 'Amplitude peak at √(ω₀² − γ²/2)', value: peakOmega, unit: 'rad/s' },
            { label: 'Points measured', value: measured.points.length, unit: '', sigFigs: 1 },
          ],
        },
      ]
    },
    notices() {
      return [
        'Change the driving frequency while running. Once the transient dies away, the measured amplitude is added to the resonance curve; repeat at several frequencies to map it.',
      ]
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      // Left: the oscillator. Right: the resonance curve.
      const split = Math.round(width * 0.38)
      const A = Math.max(peakAmplitude, 1e-6)
      const vp = fitViewport({ xMin: 0, xMax: 4 * A, yMin: -2 * A, yMax: 2 * A }, split, height)
      const x = 2.4 * A + model.state[0]
      drawSpring(ctx, vp, 0.2 * A, x - 0.25 * A, 0, palette)
      ctx.fillStyle = palette.ink
      ctx.fillRect(vp.toX(x - 0.25 * A), vp.toY(0.25 * A), 0.5 * A * vp.scale, 0.5 * A * vp.scale)
      // Resonance curve
      const left = split + 50
      const right = width - 20
      const top = 30
      const bottom = height - 40
      const X = (w: number) => left + ((right - left) * w) / omegaMax
      const Y = (a: number) => bottom - ((bottom - top) * a) / (1.15 * peakAmplitude)
      ctx.strokeStyle = palette.grid
      ctx.lineWidth = 1
      ctx.strokeRect(left, top, right - left, bottom - top)
      ctx.font = LABEL_FONT
      ctx.fillStyle = palette.gridLabel
      ctx.fillText('driving frequency ω (rad/s) →', left, bottom + 28)
      ctx.fillText('amplitude', left - 46, top - 10)
      ctx.fillText('ω₀', X(omega0) - 6, bottom + 14)
      ctx.fillText('0', left - 4, bottom + 14)
      ctx.fillText(omegaMax.toFixed(1), right - 20, bottom + 14)
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = palette.theory
      ctx.beginPath()
      for (let i = 0; i <= 300; i++) {
        const w = (omegaMax * i) / 300
        const py = Math.max(Y(steadyAmplitude(p, w)), top)
        if (i === 0) ctx.moveTo(X(w), py)
        else ctx.lineTo(X(w), py)
      }
      ctx.stroke()
      ctx.restore()
      for (const pt of measured.points) drawDisc(ctx, X(pt.omega), Y(pt.amplitude), 4, palette.position)
      const w = model.parameters.driveFrequency
      ctx.strokeStyle = palette.force
      ctx.beginPath()
      ctx.moveTo(X(w), top)
      ctx.lineTo(X(w), bottom)
      ctx.stroke()
      drawLabel(ctx, 'current ω', X(w) + 4, top + 14, palette.force)
      drawLabel(ctx, '— theory   ● measured', right - 150, top + 14, palette.muted)
    },
  }
}

export const resonanceSimulation: SimulationDefinition = {
  id: 'resonance',
  dt: 1e-3,
  canvasDescription: 'A driven mass on a spring beside its resonance curve: theoretical amplitude against driving frequency, with measured points.',
  parameters: [
    { kind: 'number', key: 'mass', label: 'Mass m', unit: 'kg', min: 0.05, max: 5, step: 0.05, defaultValue: 0.5 },
    { kind: 'number', key: 'stiffness', label: 'Spring constant k', unit: 'N/m', min: 1, max: 100, step: 0.5, defaultValue: 20 },
    { kind: 'number', key: 'damping', label: 'Damping b', unit: 'kg/s', min: 0.02, max: 5, step: 0.01, defaultValue: 0.5, description: 'Smaller damping gives a taller, narrower resonance peak.' },
    { kind: 'number', key: 'driveForce', label: 'Driving force amplitude F₀', unit: 'N', min: 0.01, max: 5, step: 0.01, defaultValue: 0.5 },
    { kind: 'number', key: 'driveOmega', label: 'Driving frequency ω', unit: 'rad/s', min: 0.1, max: 20, step: 0.05, defaultValue: 4, live: true, description: 'Can be changed while running.' },
  ],
  equations: [
    { label: 'Equation of motion', expression: 'm x″ + b x′ + k x = F₀ cos ωt' },
    { label: 'Steady-state amplitude', expression: 'A(ω) = (F₀/m) / √((ω₀² − ω²)² + (γω)²)' },
    { label: 'Phase lag', expression: 'tan δ = γω / (ω₀² − ω²)' },
    { label: 'Definitions', expression: 'ω₀ = √(k/m),  γ = b/m,  Q = ω₀/γ' },
  ],
  sampleInterval: () => 0.01,
  channels: [
    { key: 'x', label: 'x', unit: 'm' },
    { key: 'xExact', label: 'x, exact solution', unit: 'm' },
    { key: 'drive', label: 'Driving force', unit: 'N' },
  ],
  charts: [
    { id: 'displacement', title: 'Displacement', unit: 'm', series: [{ key: 'x', color: 'position' }, { key: 'xExact', color: 'theory', theory: true }] },
    { id: 'drive', title: 'Driving force', unit: 'N', series: [{ key: 'drive', color: 'force' }] },
  ],
  create: createInstance,
}
