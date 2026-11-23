import { TimeSeriesRecorder } from '@/data/TimeSeriesRecorder'
import { dragFactor, dragFreeTheory, ProjectileModel } from '@/physics/models/projectile'
import type { ProjectileParams } from '@/physics/models/projectile'
import { clear, drawArrow, drawDisc, drawGrid, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { bool, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'

const dragOn = (v: ParameterValues) => v.dragEnabled === true

function readParams(v: ParameterValues): ProjectileParams {
  return {
    speed: num(v, 'speed'),
    angleDeg: num(v, 'angleDeg'),
    launchHeight: num(v, 'launchHeight'),
    gravity: num(v, 'gravity'),
    dragEnabled: bool(v, 'dragEnabled'),
    mass: num(v, 'mass'),
    dragCoefficient: num(v, 'dragCoefficient'),
    diameter: num(v, 'diameter'),
    airDensity: num(v, 'airDensity'),
  }
}

function createInstance(values: ParameterValues): SimulationInstance {
  const params = readParams(values)
  const model = new ProjectileModel(params)
  const angle = (params.angleDeg * Math.PI) / 180
  const theory = dragFreeTheory(params.speed, angle, params.launchHeight, params.gravity)
  const k = dragFactor(params)
  // Trail sampling: ~600 points per flight, bounded memory.
  const trail = new TimeSeriesRecorder(['x', 'y'], { interval: Math.max(theory.flightTime / 600, 1e-3), capacity: 2000 })
  trail.sample(0, [model.state[0], model.state[1]])

  const bounds = {
    xMin: -0.06 * Math.max(theory.range, 1),
    xMax: 1.06 * Math.max(theory.range, 1),
    yMin: -0.08 * Math.max(theory.maxHeight, 1),
    yMax: 1.12 * Math.max(theory.maxHeight, 1),
  }
  const vScale = (0.15 * (bounds.xMax - bounds.xMin)) / Math.max(params.speed, 1e-9)

  return {
    get time() {
      return model.time
    },
    get finished() {
      return model.finished
    },
    step(dt) {
      model.step(dt)
      trail.sample(model.time, [model.state[0], model.state[1]])
    },
    readouts() {
      const [x, y, vx, vy] = model.state
      const measured = (value: number | undefined) => value ?? Number.NaN
      return [
        {
          title: 'State',
          items: [
            { label: 'Horizontal position x', value: x, unit: 'm' },
            { label: 'Height y', value: y, unit: 'm' },
            { label: 'Velocity vₓ', value: vx, unit: 'm/s' },
            { label: 'Velocity v_y', value: vy, unit: 'm/s' },
            { label: 'Speed |v|', value: Math.hypot(vx, vy), unit: 'm/s' },
          ],
        },
        {
          title: params.dragEnabled ? 'Simulation vs drag-free theory' : 'Simulation vs theory',
          items: [
            { label: 'Range (simulated)', value: measured(model.landing?.x), unit: 'm', description: 'Measured at the located landing point' },
            { label: 'Range (theory)', value: theory.range, unit: 'm' },
            { label: 'Max height (simulated)', value: measured(model.apex?.y), unit: 'm', description: 'Located where v_y = 0' },
            { label: 'Max height (theory)', value: theory.maxHeight, unit: 'm' },
            { label: 'Flight time (simulated)', value: measured(model.landing?.time), unit: 's' },
            { label: 'Flight time (theory)', value: theory.flightTime, unit: 's' },
            ...(params.dragEnabled
              ? [{ label: 'Terminal speed √(mg/k)', value: k > 0 ? Math.sqrt((params.mass * params.gravity) / k) : Infinity, unit: 'm/s' }]
              : []),
          ],
        },
      ]
    },
    notices() {
      return params.dragEnabled
        ? ['Drag is on. There is no closed-form solution with quadratic drag, so the theory values are the drag-free prediction, shown for comparison. The dashed curve is the drag-free path.']
        : []
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport(bounds, width, height, 24, 'bottom')
      drawGrid(ctx, vp, palette)
      // Ground and launch platform
      ctx.strokeStyle = palette.muted
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, vp.toY(0))
      ctx.lineTo(width, vp.toY(0))
      if (params.launchHeight > 0) {
        ctx.moveTo(vp.toX(0), vp.toY(0))
        ctx.lineTo(vp.toX(0), vp.toY(params.launchHeight))
      }
      ctx.stroke()
      // Drag-free theoretical path (dashed)
      ctx.save()
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = palette.theory
      ctx.globalAlpha = 0.7
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i <= 120; i++) {
        const t = (theory.flightTime * i) / 120
        const px = vp.toX(params.speed * Math.cos(angle) * t)
        const py = vp.toY(params.launchHeight + params.speed * Math.sin(angle) * t - 0.5 * params.gravity * t * t)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.restore()
      // Simulated trail
      const xs = trail.series('x')
      const ys = trail.series('y')
      ctx.strokeStyle = palette.position
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < xs.length; i++) {
        if (i === 0) ctx.moveTo(vp.toX(xs[i]), vp.toY(ys[i]))
        else ctx.lineTo(vp.toX(xs[i]), vp.toY(ys[i]))
      }
      ctx.lineTo(vp.toX(model.state[0]), vp.toY(model.state[1]))
      ctx.stroke()
      // Markers
      if (model.apex && model.apex.time > 0) {
        drawDisc(ctx, vp.toX(model.apex.x), vp.toY(model.apex.y), 3, palette.ink)
        drawLabel(ctx, 'max height', vp.toX(model.apex.x) + 6, vp.toY(model.apex.y) - 6, palette.muted)
      }
      if (model.landing) drawLabel(ctx, 'landing', vp.toX(model.landing.x) - 20, vp.toY(0) + 16, palette.muted)
      // Body and velocity vector
      const bx = vp.toX(model.state[0])
      const by = vp.toY(model.state[1])
      if (!model.finished) {
        drawArrow(ctx, bx, by, bx + model.state[2] * vScale * vp.scale, by - model.state[3] * vScale * vp.scale, palette.velocity, 'v')
      }
      drawDisc(ctx, bx, by, 6, palette.ink, palette.background)
    },
  }
}

export const projectileSimulation: SimulationDefinition = {
  id: 'projectile-motion',
  dt: 1e-3,
  canvasDescription: 'Side view of the projectile’s path over metre-gridded ground, with its velocity vector and the drag-free path dashed.',
  parameters: [
    { kind: 'number', key: 'speed', label: 'Launch speed v₀', unit: 'm/s', min: 0.5, max: 100, step: 0.5, defaultValue: 20 },
    { kind: 'number', key: 'angleDeg', label: 'Launch angle θ', unit: '°', min: 0, max: 90, step: 1, defaultValue: 45 },
    { kind: 'number', key: 'launchHeight', label: 'Launch height h₀', unit: 'm', min: 0, max: 100, step: 0.5, defaultValue: 0 },
    { kind: 'number', key: 'gravity', label: 'Gravity g', unit: 'm/s²', min: 0.5, max: 30, step: 0.01, defaultValue: 9.80665, description: 'Earth 9.807 · Moon 1.62 · Mars 3.71' },
    { kind: 'boolean', key: 'dragEnabled', label: 'Air resistance (quadratic drag)', defaultValue: false },
    { kind: 'number', key: 'mass', label: 'Mass m', unit: 'kg', min: 0.01, max: 10, step: 0.005, defaultValue: 0.145, visibleWhen: dragOn },
    { kind: 'number', key: 'dragCoefficient', label: 'Drag coefficient C_d', unit: '', min: 0.05, max: 2, step: 0.01, defaultValue: 0.47, visibleWhen: dragOn, description: 'Held constant; 0.47 is the textbook value for a smooth sphere.' },
    { kind: 'number', key: 'diameter', label: 'Diameter d', unit: 'm', min: 0.01, max: 1, step: 0.001, defaultValue: 0.0732, visibleWhen: dragOn },
    { kind: 'number', key: 'airDensity', label: 'Air density ρ', unit: 'kg/m³', min: 0, max: 2, step: 0.005, defaultValue: 1.225, visibleWhen: dragOn },
  ],
  equations: [
    { label: 'Horizontal position', expression: 'x(t) = v₀ cos θ · t' },
    { label: 'Vertical position', expression: 'y(t) = h₀ + v₀ sin θ · t − ½ g t²' },
    { label: 'Flight time', expression: 'T = (v₀ sin θ + √(v₀² sin²θ + 2 g h₀)) / g' },
    { label: 'Range', expression: 'R = v₀ cos θ · T   (= v₀² sin 2θ / g when h₀ = 0)' },
    { label: 'Maximum height', expression: 'H = h₀ + v₀² sin²θ / (2g)' },
    { label: 'With drag', expression: 'm dv/dt = m g − ½ ρ C_d A |v| v' },
  ],
  create: createInstance,
}
