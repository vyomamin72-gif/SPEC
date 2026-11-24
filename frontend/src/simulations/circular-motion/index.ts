import { CircularModel } from '@/physics/models/circular'
import { clear, drawArrow, drawDisc, drawGrid, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { bool, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'

function createInstance(values: ParameterValues): SimulationInstance {
  const params = {
    radius: num(values, 'radius'),
    mass: num(values, 'mass'),
    initialOmega: num(values, 'initialOmega'),
    tangentialForce: num(values, 'tangentialForce'),
  }
  const model = new CircularModel(params)
  if (bool(values, 'cut')) model.cut()
  let forceConstant = true
  const r = params.radius
  const omegaTheory = (t: number) => params.initialOmega + (params.tangentialForce / (params.mass * r)) * t

  return {
    get time() {
      return model.time
    },
    finished: false,
    step: (dt) => model.step(dt),
    update(next) {
      const force = num(next, 'tangentialForce')
      if (force !== model.parameters.tangentialForce) forceConstant = false
      model.setTangentialForce(force)
      if (bool(next, 'cut')) model.cut()
    },
    sample() {
      const [vx, vy] = model.velocity
      const omega = model.free ? Number.NaN : model.angular[1]
      return [omega, forceConstant && !model.free ? omegaTheory(model.time) : Number.NaN, Math.hypot(vx, vy), model.tension, model.centripetalAcceleration]
    },
    readouts() {
      const omega = model.angular[1]
      const [vx, vy] = model.velocity
      const [x, y] = model.position
      const attached = !model.free
      return [
        {
          title: attached ? 'Circular motion' : 'After the tether was cut',
          items: [
            { label: 'Angular velocity ω', value: attached ? omega : Number.NaN, unit: 'rad/s' },
            { label: 'Speed v', value: Math.hypot(vx, vy), unit: 'm/s' },
            { label: 'Period 2π/ω', value: attached && omega !== 0 ? (2 * Math.PI) / Math.abs(omega) : Number.NaN, unit: 's' },
            { label: 'Distance from centre', value: Math.hypot(x, y), unit: 'm' },
          ],
        },
        {
          title: 'Acceleration and force',
          items: [
            { label: 'Centripetal acceleration ω²r', value: model.centripetalAcceleration, unit: 'm/s²' },
            { label: 'Same, from v²/r', value: attached ? (vx * vx + vy * vy) / r : Number.NaN, unit: 'm/s²' },
            { label: 'Tangential acceleration', value: model.tangentialAcceleration, unit: 'm/s²' },
            { label: 'Tension T = mω²r', value: model.tension, unit: 'N' },
          ],
        },
        {
          title: 'Theory',
          items: [
            {
              label: 'ω (theory, ω₀ + F t /(m r))',
              value: forceConstant && attached ? omegaTheory(model.time) : Number.NaN,
              unit: 'rad/s',
              description: 'Applies while the tangential force has been constant and the tether is intact',
            },
          ],
        },
      ]
    },
    notices() {
      const n = ['Tick “Cut the tether” while running: the body leaves along the tangent, not outward — there is no outward force.']
      if (model.free) n.push('The tether is cut: no force acts, so the body moves in a straight line at constant speed (Newton’s first law).')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const extent = model.free ? Math.max(1.3 * r, Math.hypot(...model.position) + 0.3 * r) : 1.3 * r
      const vp = fitViewport({ xMin: -extent, xMax: extent, yMin: -extent, yMax: extent }, width, height)
      drawGrid(ctx, vp, palette)
      ctx.save()
      ctx.setLineDash([4, 5])
      ctx.strokeStyle = palette.line
      ctx.beginPath()
      ctx.arc(vp.toX(0), vp.toY(0), r * vp.scale, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.restore()
      const [x, y] = model.position
      const [vx, vy] = model.velocity
      if (model.free) {
        ctx.strokeStyle = palette.position
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(vp.toX(x - vx * (model.time - model.free.cutTime)), vp.toY(y - vy * (model.time - model.free.cutTime)))
        ctx.lineTo(vp.toX(x), vp.toY(y))
        ctx.stroke()
      } else {
        ctx.strokeStyle = palette.ink
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(vp.toX(0), vp.toY(0))
        ctx.lineTo(vp.toX(x), vp.toY(y))
        ctx.stroke()
        const ac = 0.6 * r
        const d = Math.hypot(x, y)
        drawArrow(ctx, vp.toX(x), vp.toY(y), vp.toX(x - (ac * x) / d), vp.toY(y - (ac * y) / d), palette.acceleration, 'a_c')
      }
      drawDisc(ctx, vp.toX(0), vp.toY(0), 3, palette.muted)
      const speed = Math.hypot(vx, vy) || 1
      const vl = 0.6 * r
      drawArrow(ctx, vp.toX(x), vp.toY(y), vp.toX(x + (vl * vx) / speed), vp.toY(y + (vl * vy) / speed), palette.velocity, 'v')
      drawDisc(ctx, vp.toX(x), vp.toY(y), 8 + 3 * Math.cbrt(params.mass), palette.ink, palette.background)
      drawLabel(ctx, `r = ${r} m`, 8, 18, palette.gridLabel)
    },
  }
}

export const circularMotionSimulation: SimulationDefinition = {
  id: 'circular-motion',
  dt: 1e-3,
  canvasDescription: 'Top view of a mass on a tether circling a fixed centre, with velocity and centripetal acceleration vectors.',
  parameters: [
    { kind: 'number', key: 'radius', label: 'Radius r', unit: 'm', min: 0.1, max: 10, step: 0.1, defaultValue: 2 },
    { kind: 'number', key: 'mass', label: 'Mass m', unit: 'kg', min: 0.1, max: 10, step: 0.1, defaultValue: 0.5 },
    { kind: 'number', key: 'initialOmega', label: 'Initial angular velocity ω₀', unit: 'rad/s', min: -10, max: 10, step: 0.1, defaultValue: 2 },
    { kind: 'number', key: 'tangentialForce', label: 'Tangential force F_t', unit: 'N', min: -5, max: 5, step: 0.05, defaultValue: 0, live: true, description: 'Speeds the body up or slows it down. Can be changed while running.' },
    { kind: 'boolean', key: 'cut', label: 'Cut the tether', defaultValue: false, live: true },
  ],
  equations: [
    { label: 'Speed', expression: 'v = ω r' },
    { label: 'Centripetal acceleration', expression: 'a_c = v²/r = ω² r   (towards the centre)' },
    { label: 'Tension supplies it', expression: 'T = m ω² r' },
    { label: 'Tangential', expression: 'a_t = F_t / m,  α = a_t / r' },
  ],
  sampleInterval: () => 0.01,
  channels: [
    { key: 'omega', label: 'ω', unit: 'rad/s' },
    { key: 'omegaTheory', label: 'ω, theory ω₀ + αt', unit: 'rad/s' },
    { key: 'speed', label: 'Speed', unit: 'm/s' },
    { key: 'tension', label: 'Tension', unit: 'N' },
    { key: 'ac', label: 'Centripetal acceleration', unit: 'm/s²' },
  ],
  charts: [
    { id: 'omega', title: 'Angular velocity', unit: 'rad/s', series: [{ key: 'omega', color: 'velocity' }, { key: 'omegaTheory', color: 'theory', theory: true }] },
    { id: 'speed', title: 'Speed', unit: 'm/s', series: [{ key: 'speed', color: 'velocity' }] },
    { id: 'tension', title: 'Tension', unit: 'N', series: [{ key: 'tension', color: 'force' }] },
  ],
  create: createInstance,
}
