import { INTEGRATOR_INFO } from '@/physics/core/integrators'
import type { IntegratorName } from '@/physics/core/integrators'
import { dampedLinearPeriod, exactPeriod, PendulumModel, smallAnglePeriod } from '@/physics/models/pendulum'
import type { PendulumParams } from '@/physics/models/pendulum'
import { clear, drawArrow, drawDisc, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'

const INTEGRATORS = Object.keys(INTEGRATOR_INFO) as IntegratorName[]

function readParams(v: ParameterValues): PendulumParams {
  return {
    length: num(v, 'length'),
    mass: num(v, 'mass'),
    amplitudeDeg: num(v, 'amplitudeDeg'),
    gravity: num(v, 'gravity'),
    dampingCoefficient: num(v, 'dampingCoefficient'),
    model: choice(v, 'model', ['nonlinear', 'linear'] as const),
    integrator: choice(v, 'integrator', INTEGRATORS),
  }
}

function createInstance(values: ParameterValues): SimulationInstance {
  const p = readParams(values)
  const model = new PendulumModel(p)
  const amplitude = (p.amplitudeDeg * Math.PI) / 180
  const gamma = p.dampingCoefficient / p.mass
  const damped = p.dampingCoefficient > 0
  const t0 = smallAnglePeriod(p.length, p.gravity)
  // The theory that applies to the selected model and damping.
  const theoryPeriod =
    p.model === 'linear' ? dampedLinearPeriod(p.length, p.gravity, gamma) : damped ? Number.NaN : exactPeriod(p.length, p.gravity, amplitude)
  const maxSpeed = Math.sqrt(2 * p.gravity * p.length * (1 - Math.cos(amplitude))) || 1
  const bounds = { xMin: -1.2 * p.length, xMax: 1.2 * p.length, yMin: -1.2 * p.length, yMax: 1.2 * p.length }

  return {
    get time() {
      return model.time
    },
    finished: false,
    step: (dt) => model.step(dt),
    readouts() {
      const [theta, omega] = model.state
      const energy = model.totalEnergy()
      return [
        {
          title: 'State',
          items: [
            { label: 'Angle θ', value: (theta * 180) / Math.PI, unit: '°' },
            { label: 'Angular velocity ω', value: omega, unit: 'rad/s' },
            { label: 'Bob speed', value: Math.abs(omega) * p.length, unit: 'm/s' },
          ],
        },
        {
          title: 'Period',
          items: [
            { label: 'Period (measured)', value: model.measuredPeriod, unit: 's', description: 'Time between successive downward zero crossings of θ' },
            {
              label: p.model === 'linear' ? 'Period (theory, 2π/ω_d)' : 'Period (exact theory)',
              value: theoryPeriod,
              unit: 's',
              description: Number.isNaN(theoryPeriod) ? 'No closed form for the damped nonlinear pendulum' : undefined,
            },
            { label: 'Small-angle period 2π√(L/g)', value: t0, unit: 's' },
            {
              label: 'Small-angle model error',
              value: p.model === 'nonlinear' && !damped ? (exactPeriod(p.length, p.gravity, amplitude) / t0 - 1) * 100 : Number.NaN,
              unit: '%',
              description: 'How wrong 2π√(L/g) is at this amplitude. A model error, not a numerical one.',
            },
            { label: 'Periods completed', value: Math.max(0, model.crossings.length - 1), unit: '', sigFigs: 1 },
          ],
        },
        {
          title: 'Energy',
          items: [
            { label: 'Kinetic', value: model.kineticEnergy(), unit: 'J' },
            { label: 'Potential', value: model.potentialEnergy(), unit: 'J' },
            { label: 'Total', value: energy, unit: 'J' },
            {
              label: damped ? 'Change since release' : 'Numerical energy drift',
              value: model.initialEnergy > 0 ? (energy / model.initialEnergy - 1) * 100 : Number.NaN,
              unit: '%',
              description: damped
                ? 'Includes the real dissipation from damping.'
                : 'Undamped, the true energy is constant: any change is integrator error.',
              sigFigs: 3,
            },
          ],
        },
      ]
    },
    notices() {
      const notices: string[] = []
      if (!damped) notices.push('Without damping, the mass has no effect on the motion (it cancels in the equation of motion).')
      if (p.integrator === 'euler') notices.push('Explicit Euler is selected: watch the energy drift grow. It is a numerical artefact, not physics.')
      if (p.model === 'linear' && p.amplitudeDeg > 15) notices.push('The linear model uses sin θ ≈ θ, which is inaccurate at this amplitude.')
      return notices
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport(bounds, width, height)
      const px = vp.toX(0)
      const py = vp.toY(0)
      const r = p.length * vp.scale
      // Amplitude arc
      ctx.save()
      ctx.setLineDash([4, 5])
      ctx.strokeStyle = palette.line
      ctx.beginPath()
      ctx.arc(px, py, r, Math.PI / 2 - amplitude, Math.PI / 2 + amplitude)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px, py + r)
      ctx.stroke()
      ctx.restore()
      // Support, rod, bob
      ctx.strokeStyle = palette.muted
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(px - 30, py)
      ctx.lineTo(px + 30, py)
      ctx.stroke()
      const [theta, omega] = model.state
      const bx = vp.toX(p.length * Math.sin(theta))
      const by = vp.toY(-p.length * Math.cos(theta))
      ctx.strokeStyle = palette.ink
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(bx, by)
      ctx.stroke()
      const speedScale = (0.5 * p.length * vp.scale) / maxSpeed
      const v = omega * p.length
      drawArrow(ctx, bx, by, bx + v * Math.cos(theta) * speedScale, by + v * Math.sin(theta) * speedScale, palette.velocity, 'v')
      drawDisc(ctx, bx, by, 8 + 3 * Math.cbrt(p.mass), palette.ink, palette.background)
      drawLabel(ctx, `θ = ${((theta * 180) / Math.PI).toFixed(1)}°`, px + 8, py + 20, palette.muted)
      drawLabel(ctx, `L = ${p.length} m`, 8, 18, palette.gridLabel)
    },
  }
}

export const pendulumSimulation: SimulationDefinition = {
  id: 'pendulum',
  dt: 1e-3,
  canvasDescription: 'A pendulum swinging from a fixed support, with its velocity vector and the release amplitude dashed.',
  parameters: [
    { kind: 'number', key: 'length', label: 'Length L', unit: 'm', min: 0.1, max: 10, step: 0.05, defaultValue: 1 },
    { kind: 'number', key: 'amplitudeDeg', label: 'Release angle θ₀', unit: '°', min: 1, max: 179, step: 1, defaultValue: 30 },
    { kind: 'number', key: 'mass', label: 'Mass m', unit: 'kg', min: 0.1, max: 10, step: 0.1, defaultValue: 1 },
    { kind: 'number', key: 'gravity', label: 'Gravity g', unit: 'm/s²', min: 0.5, max: 30, step: 0.01, defaultValue: 9.80665 },
    { kind: 'number', key: 'dampingCoefficient', label: 'Damping b', unit: 'kg/s', min: 0, max: 5, step: 0.05, defaultValue: 0, description: 'Linear drag force −b·v on the bob.' },
    {
      kind: 'choice', key: 'model', label: 'Model', defaultValue: 'nonlinear',
      options: [
        { value: 'nonlinear', label: 'Nonlinear (sin θ)' },
        { value: 'linear', label: 'Small-angle (sin θ ≈ θ)' },
      ],
    },
    {
      kind: 'choice', key: 'integrator', label: 'Integrator', defaultValue: 'rk4',
      options: INTEGRATORS.map((value) => ({ value, label: INTEGRATOR_INFO[value].label })),
      description: 'Changing it shows how numerical methods differ in energy behaviour.',
    },
  ],
  equations: [
    { label: 'Equation of motion', expression: 'd²θ/dt² = −(g/L) sin θ − (b/m) dθ/dt' },
    { label: 'Small-angle period', expression: 'T₀ = 2π √(L/g)' },
    { label: 'Exact period (undamped)', expression: 'T = 4 √(L/g) · K(sin(θ₀/2))' },
    { label: 'Energy', expression: 'E = ½ m L² ω² + m g L (1 − cos θ)' },
  ],
  create: createInstance,
}
