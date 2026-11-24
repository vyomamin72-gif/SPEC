import { INTEGRATOR_INFO } from '@/physics/core/integrators'
import type { IntegratorName } from '@/physics/core/integrators'
import { exactDisplacement, OscillatorModel } from '@/physics/models/oscillator'
import { clear, drawArrow, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'
import { drawSpring } from '../shared/drawing'

const INTEGRATORS = Object.keys(INTEGRATOR_INFO) as IntegratorName[]

function createInstance(values: ParameterValues): SimulationInstance {
  const p = {
    mass: num(values, 'mass'),
    stiffness: num(values, 'stiffness'),
    damping: num(values, 'damping'),
    initialDisplacement: num(values, 'amplitude'),
    driveAmplitude: 0,
    driveFrequency: 1,
    integrator: choice(values, 'integrator', INTEGRATORS),
  }
  const model = new OscillatorModel(p)
  const omega0 = Math.sqrt(p.stiffness / p.mass)
  const gamma = p.damping / p.mass
  const wd2 = omega0 ** 2 - gamma ** 2 / 4
  const theoryPeriod = wd2 > 0 ? (2 * Math.PI) / Math.sqrt(wd2) : Number.NaN
  const A = Math.abs(p.initialDisplacement)

  return {
    get time() {
      return model.time
    },
    finished: false,
    step: (dt) => model.step(dt),
    sample() {
      const k = model.kineticEnergy()
      const u = model.potentialEnergy()
      return [model.state[0], exactDisplacement(p, model.time), model.state[1], k, u, k + u]
    },
    readouts() {
      const e = model.kineticEnergy() + model.potentialEnergy()
      return [
        {
          title: 'State',
          items: [
            { label: 'Displacement x', value: model.state[0], unit: 'm' },
            { label: 'Velocity v', value: model.state[1], unit: 'm/s' },
            { label: 'Acceleration −(k/m)x', value: (-p.stiffness * model.state[0] - p.damping * model.state[1]) / p.mass, unit: 'm/s²' },
          ],
        },
        {
          title: 'Period',
          items: [
            { label: 'Period (measured)', value: model.measuredPeriod, unit: 's', description: 'Mean time between downward zero crossings' },
            { label: p.damping > 0 ? 'Period (theory, 2π/ω_d)' : 'Period (theory, 2π√(m/k))', value: theoryPeriod, unit: 's' },
            { label: 'Natural frequency f₀', value: omega0 / (2 * Math.PI), unit: 'Hz' },
          ],
        },
        {
          title: 'Energy',
          items: [
            { label: 'Kinetic ½mv²', value: model.kineticEnergy(), unit: 'J' },
            { label: 'Elastic potential ½kx²', value: model.potentialEnergy(), unit: 'J' },
            { label: p.damping > 0 ? 'Change since release' : 'Numerical energy drift', value: (e / model.initialEnergy - 1) * 100, unit: '%', sigFigs: 3 },
          ],
        },
      ]
    },
    notices() {
      const n = ['The period does not depend on the amplitude: a defining property of simple harmonic motion (try changing it).']
      if (wd2 <= 0) n.push('Critically damped or overdamped: the mass returns to rest without oscillating, so there is no period.')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const span = Math.max(A, 0.01) * 1.6
      const rest = 2 * span
      const vp = fitViewport({ xMin: -0.2 * span, xMax: rest + 1.6 * span, yMin: -span, yMax: span }, width, height)
      ctx.fillStyle = palette.line
      ctx.fillRect(vp.toX(-0.2 * span), vp.toY(0.5 * span), 0.2 * span * vp.scale, span * vp.scale)
      const x = rest + model.state[0]
      drawSpring(ctx, vp, 0, x - 0.15 * span, 0, palette)
      ctx.fillStyle = palette.ink
      ctx.fillRect(vp.toX(x - 0.15 * span), vp.toY(0.15 * span), 0.3 * span * vp.scale, 0.3 * span * vp.scale)
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = palette.theory
      ctx.beginPath()
      ctx.moveTo(vp.toX(rest), vp.toY(-0.6 * span))
      ctx.lineTo(vp.toX(rest), vp.toY(0.6 * span))
      ctx.stroke()
      ctx.restore()
      drawLabel(ctx, 'equilibrium', vp.toX(rest) - 30, vp.toY(-0.6 * span) + 14, palette.gridLabel)
      const vMax = A * omega0 || 1
      drawArrow(ctx, vp.toX(x), vp.toY(-0.3 * span), vp.toX(x + (0.6 * span * model.state[1]) / vMax), vp.toY(-0.3 * span), palette.velocity, 'v')
    },
  }
}

export const simpleHarmonicSimulation: SimulationDefinition = {
  id: 'simple-harmonic-motion',
  dt: 1e-3,
  canvasDescription: 'A block on a horizontal spring oscillating about its equilibrium position, with its velocity vector.',
  parameters: [
    { kind: 'number', key: 'mass', label: 'Mass m', unit: 'kg', min: 0.05, max: 10, step: 0.05, defaultValue: 0.5 },
    { kind: 'number', key: 'stiffness', label: 'Spring constant k', unit: 'N/m', min: 0.5, max: 200, step: 0.5, defaultValue: 20 },
    { kind: 'number', key: 'amplitude', label: 'Initial displacement x₀', unit: 'm', min: 0.01, max: 1, step: 0.01, defaultValue: 0.2 },
    { kind: 'number', key: 'damping', label: 'Damping b', unit: 'kg/s', min: 0, max: 10, step: 0.05, defaultValue: 0 },
    { kind: 'choice', key: 'integrator', label: 'Integrator', defaultValue: 'rk4', options: INTEGRATORS.map((value) => ({ value, label: INTEGRATOR_INFO[value].label })) },
  ],
  equations: [
    { label: 'Hooke’s law', expression: 'F = −k x' },
    { label: 'Equation of motion', expression: 'm d²x/dt² = −k x − b dx/dt' },
    { label: 'Solution (undamped)', expression: 'x(t) = x₀ cos(ω₀ t),  ω₀ = √(k/m)' },
    { label: 'Period', expression: 'T = 2π √(m/k)' },
  ],
  sampleInterval: () => 0.005,
  channels: [
    { key: 'x', label: 'x', unit: 'm' },
    { key: 'xExact', label: 'x, exact solution', unit: 'm' },
    { key: 'v', label: 'v', unit: 'm/s' },
    { key: 'ke', label: 'Kinetic energy', unit: 'J' },
    { key: 'pe', label: 'Elastic potential energy', unit: 'J' },
    { key: 'energy', label: 'Total energy', unit: 'J' },
  ],
  charts: [
    { id: 'position', title: 'Displacement', unit: 'm', series: [{ key: 'x', color: 'position' }, { key: 'xExact', color: 'theory', theory: true }] },
    { id: 'velocity', title: 'Velocity', unit: 'm/s', series: [{ key: 'v', color: 'velocity' }] },
    { id: 'energy', title: 'Energy', unit: 'J', series: [{ key: 'ke', color: 'velocity' }, { key: 'pe', color: 'position' }, { key: 'energy', color: 'energy' }] },
  ],
  create: createInstance,
}
