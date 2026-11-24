import { collisionEnergyLoss, CollisionModel, resolveVelocities } from '@/physics/models/collisions'
import { clear, drawArrow, drawGrid, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { bool, choice, num } from '../types'
import type { ParameterValues, ReadoutItem, SimulationDefinition, SimulationInstance } from '../types'

const TRACK = 10
const WIDTH = 0.6
const threeBodies = (v: ParameterValues) => v.bodyCount === '3'

function createInstance(values: ParameterValues): SimulationInstance {
  const count = choice(values, 'bodyCount', ['2', '3'] as const) === '3' ? 3 : 2
  const starts = count === 2 ? [2.5, 7.5] : [1.5, 5, 8.5]
  const model = new CollisionModel({
    bodies: starts.map((x, i) => ({ mass: num(values, `m${i + 1}`), v: num(values, `v${i + 1}`), x, width: WIDTH })),
    restitution: num(values, 'restitution'),
    walls: bool(values, 'walls'),
    trackLength: TRACK,
  })
  const p0 = model.momentum
  const k0 = model.kineticEnergy
  const vMax = Math.max(...model.bodies.map((b) => Math.abs(b.v)), 0.1)
  const mMax = Math.max(...model.bodies.map((b) => b.mass))

  return {
    get time() {
      return model.time
    },
    get finished() {
      return model.finished
    },
    step: (dt) => model.step(dt),
    sample() {
      const v = model.bodies.map((b) => b.v)
      const p = model.bodies.map((b) => b.mass * b.v)
      while (v.length < 3) {
        v.push(Number.NaN)
        p.push(Number.NaN)
      }
      return [...v, ...p, model.momentum, model.kineticEnergy]
    },
    readouts() {
      const items: ReadoutItem[] = []
      const first = model.collisions.find((c) => c.right >= 0)
      if (first) {
        const a = model.bodies[first.left]
        const b = model.bodies[first.right]
        const [pa, pb] = resolveVelocities(a.mass, first.before[0], b.mass, first.before[1], model.restitution)
        items.push(
          { label: 'Left body after (simulated)', value: first.after[0], unit: 'm/s' },
          { label: 'Left body after (theory)', value: pa, unit: 'm/s' },
          { label: 'Right body after (simulated)', value: first.after[1], unit: 'm/s' },
          { label: 'Right body after (theory)', value: pb, unit: 'm/s' },
          {
            label: 'Energy lost (theory)',
            value: collisionEnergyLoss(a.mass, first.before[0], b.mass, first.before[1], model.restitution),
            unit: 'J',
            description: '½μ(1 − e²)(v₁ − v₂)², μ = m₁m₂/(m₁+m₂)',
          },
        )
      }
      return [
        {
          title: 'Bodies',
          items: model.bodies.map((b, i) => ({ label: `Body ${i + 1} velocity`, value: b.v, unit: 'm/s' })),
        },
        {
          title: 'Conservation',
          items: [
            { label: 'Total momentum (initial)', value: p0, unit: 'kg·m/s' },
            { label: 'Total momentum (now)', value: model.momentum, unit: 'kg·m/s' },
            { label: 'Kinetic energy (initial)', value: k0, unit: 'J' },
            { label: 'Kinetic energy (now)', value: model.kineticEnergy, unit: 'J' },
            { label: 'Collisions', value: model.collisions.filter((c) => c.right >= 0).length, unit: '', sigFigs: 1 },
          ],
        },
        { title: 'First collision vs theory', items: items.length ? items : [{ label: 'Waiting for the first collision', text: '', unit: '' }] },
      ]
    },
    notices() {
      const n: string[] = []
      if (model.walls) n.push('Walls are external objects: they reverse velocities, so total momentum is not conserved when a body hits a wall.')
      if (model.safeguardEngaged) n.push('Inelastic-collapse safeguard engaged: bodies in contact were merged to keep the number of collisions finite (momentum is still conserved).')
      if (model.collisionsOver && model.collisions.length === 0) n.push('With these velocities the bodies never meet.')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport({ xMin: -0.3, xMax: TRACK + 0.3, yMin: -1.6, yMax: 2.4 }, width, height)
      drawGrid(ctx, vp, palette)
      ctx.strokeStyle = palette.muted
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(vp.toX(0), vp.toY(0))
      ctx.lineTo(vp.toX(TRACK), vp.toY(0))
      if (model.walls) {
        for (const x of [0, TRACK]) {
          ctx.moveTo(vp.toX(x), vp.toY(0))
          ctx.lineTo(vp.toX(x), vp.toY(1.6))
        }
      }
      ctx.stroke()
      const colors = [palette.position, palette.momentum, palette.energy]
      model.bodies.forEach((b, i) => {
        const h = 0.35 + 0.55 * Math.cbrt(b.mass / mMax)
        ctx.fillStyle = colors[i]
        ctx.globalAlpha = 0.85
        ctx.fillRect(vp.toX(b.x - b.width / 2), vp.toY(h), b.width * vp.scale, h * vp.scale)
        ctx.globalAlpha = 1
        drawLabel(ctx, `${b.mass} kg`, vp.toX(b.x) - 16, vp.toY(h) - 6, palette.ink)
        const tip = (1.2 * b.v) / vMax
        drawArrow(ctx, vp.toX(b.x), vp.toY(-0.5), vp.toX(b.x + tip), vp.toY(-0.5), palette.velocity, 'v')
      })
    },
  }
}

export const collisionsSimulation: SimulationDefinition = {
  id: 'collisions',
  dt: 1e-3,
  canvasDescription: 'Blocks on a straight track, block height showing mass, with velocity arrows beneath them.',
  parameters: [
    { kind: 'choice', key: 'bodyCount', label: 'Bodies', defaultValue: '2', options: [{ value: '2', label: 'Two' }, { value: '3', label: 'Three' }] },
    { kind: 'number', key: 'restitution', label: 'Coefficient of restitution e', unit: '', min: 0, max: 1, step: 0.01, defaultValue: 1, description: '1 = elastic, 0 = perfectly inelastic (bodies stick).' },
    { kind: 'number', key: 'm1', label: 'Mass m₁', unit: 'kg', min: 0.1, max: 20, step: 0.1, defaultValue: 1 },
    { kind: 'number', key: 'v1', label: 'Velocity v₁', unit: 'm/s', min: -5, max: 5, step: 0.1, defaultValue: 2 },
    { kind: 'number', key: 'm2', label: 'Mass m₂', unit: 'kg', min: 0.1, max: 20, step: 0.1, defaultValue: 3 },
    { kind: 'number', key: 'v2', label: 'Velocity v₂', unit: 'm/s', min: -5, max: 5, step: 0.1, defaultValue: -1 },
    { kind: 'number', key: 'm3', label: 'Mass m₃', unit: 'kg', min: 0.1, max: 20, step: 0.1, defaultValue: 1, visibleWhen: threeBodies },
    { kind: 'number', key: 'v3', label: 'Velocity v₃', unit: 'm/s', min: -5, max: 5, step: 0.1, defaultValue: 0, visibleWhen: threeBodies },
    { kind: 'boolean', key: 'walls', label: 'Elastic walls at the track ends', defaultValue: false },
  ],
  equations: [
    { label: 'Momentum conservation', expression: 'm₁v₁ + m₂v₂ = m₁v₁′ + m₂v₂′' },
    { label: 'Restitution', expression: 'v₂′ − v₁′ = −e (v₂ − v₁)' },
    { label: 'Result', expression: 'v₁′ = (m₁v₁ + m₂v₂ + m₂e(v₂ − v₁)) / (m₁ + m₂)' },
    { label: 'Energy lost', expression: 'ΔK = ½ μ (1 − e²)(v₁ − v₂)²,  μ = m₁m₂/(m₁+m₂)' },
  ],
  sampleInterval: () => 0.01,
  channels: [
    { key: 'v1', label: 'v₁', unit: 'm/s' },
    { key: 'v2', label: 'v₂', unit: 'm/s' },
    { key: 'v3', label: 'v₃', unit: 'm/s' },
    { key: 'p1', label: 'p₁', unit: 'kg·m/s' },
    { key: 'p2', label: 'p₂', unit: 'kg·m/s' },
    { key: 'p3', label: 'p₃', unit: 'kg·m/s' },
    { key: 'pTotal', label: 'Total momentum', unit: 'kg·m/s' },
    { key: 'ke', label: 'Total kinetic energy', unit: 'J' },
  ],
  charts: [
    { id: 'velocity', title: 'Velocity', unit: 'm/s', series: [{ key: 'v1', color: 'position' }, { key: 'v2', color: 'momentum' }, { key: 'v3', color: 'energy' }] },
    {
      id: 'momentum', title: 'Momentum', unit: 'kg·m/s',
      series: [{ key: 'p1', color: 'position' }, { key: 'p2', color: 'momentum' }, { key: 'p3', color: 'energy' }, { key: 'pTotal', color: 'theory' }],
    },
    { id: 'energy', title: 'Kinetic energy', unit: 'J', series: [{ key: 'ke', color: 'energy' }] },
  ],
  create: createInstance,
}
