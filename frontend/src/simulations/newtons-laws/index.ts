import { DROP_HEIGHT, NewtonModel, TRACK_HALF_LENGTH } from '@/physics/models/newton'
import type { NewtonParams } from '@/physics/models/newton'
import { clear, drawArrow, drawGrid, drawLabel } from '@/rendering/draw'
import type { Palette } from '@/rendering/palette'
import type { Viewport } from '@/rendering/viewport'
import { fitViewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, ReadoutItem, SimulationDefinition, SimulationInstance } from '../types'

const isPush = (v: ParameterValues) => v.scenario === 'push'
const isPulley = (v: ParameterValues) => v.scenario === 'pulley'

function readParams(v: ParameterValues): NewtonParams {
  return {
    scenario: choice(v, 'scenario', ['push', 'pulley'] as const),
    mass: num(v, 'mass'),
    hangingMass: num(v, 'hangingMass'),
    appliedForce: num(v, 'appliedForce'),
    staticFriction: num(v, 'staticFriction'),
    kineticFriction: num(v, 'kineticFriction'),
    gravity: num(v, 'gravity'),
  }
}

/**
 * Closed-form acceleration for a constant force from rest, written
 * independently of the model's friction routine so it is a genuine check.
 */
function theoryAcceleration(p: Readonly<NewtonParams>, kineticMu: number): number {
  const normal = p.mass * p.gravity
  if (p.scenario === 'push') {
    return Math.abs(p.appliedForce) <= p.staticFriction * normal
      ? 0
      : (p.appliedForce - Math.sign(p.appliedForce) * kineticMu * normal) / p.mass
  }
  const drive = p.hangingMass * p.gravity
  return drive <= p.staticFriction * normal ? 0 : (drive - kineticMu * normal) / (p.mass + p.hangingMass)
}

/** Filled block with a label, drawn from world coordinates of its bottom-left corner. */
function drawBlock(ctx: CanvasRenderingContext2D, vp: Viewport, x: number, y: number, w: number, h: number, label: string, palette: Palette) {
  ctx.fillStyle = palette.line
  ctx.strokeStyle = palette.muted
  ctx.lineWidth = 1.5
  ctx.fillRect(vp.toX(x), vp.toY(y + h), w * vp.scale, h * vp.scale)
  ctx.strokeRect(vp.toX(x), vp.toY(y + h), w * vp.scale, h * vp.scale)
  drawLabel(ctx, label, vp.toX(x + w / 2) - 10, vp.toY(y + h / 2) + 4, palette.ink)
}

function createInstance(values: ParameterValues): SimulationInstance {
  const model = new NewtonModel(readParams(values))

  return {
    get time() {
      return model.time
    },
    get finished() {
      return model.finished !== null
    },
    step: (dt) => model.step(dt),
    sample() {
      const p = model.parameters
      const f = model.forces()
      const [x, v] = model.state
      const t = model.time
      const xTheory = model.forceConstantSinceStart ? 0.5 * theoryAcceleration(p, model.effectiveKineticFriction) * t * t : Number.NaN
      return [x, xTheory, v, model.acceleration(), f.pulling, f.friction, f.net, p.mass * v]
    },
    update(next) {
      model.setAppliedForce(num(next, 'appliedForce'))
    },
    readouts() {
      const p = model.parameters
      const f = model.forces()
      const a = model.acceleration()
      const [x, v] = model.state
      const movingMass = p.scenario === 'push' ? p.mass : p.mass + p.hangingMass
      const mukN = model.effectiveKineticFriction * p.mass * p.gravity
      const theory: ReadoutItem[] = []
      if (p.scenario === 'push') {
        theory.push({ label: 'Force needed to start μs·N', value: p.staticFriction * p.mass * p.gravity, unit: 'N' })
        const decelerating = p.appliedForce === 0 && v !== 0 && mukN > 0
        theory.push({
          label: 'Predicted stopping point',
          value: decelerating ? x + (Math.sign(v) * v * v) / (2 * (mukN / p.mass)) : Number.NaN,
          unit: 'm',
          description: 'x + v²/(2μk·g), shown while sliding with no applied force',
        })
        theory.push({ label: 'Measured stopping point', value: model.lastStopPosition ?? Number.NaN, unit: 'm' })
      } else {
        const aTheory = theoryAcceleration(p, model.effectiveKineticFriction)
        theory.push({ label: 'Acceleration (theory)', value: aTheory, unit: 'm/s²', description: '(m₂g − μk·m₁g)/(m₁ + m₂), or 0 if static friction holds' })
        theory.push({ label: 'Tension (theory)', value: p.hangingMass * (p.gravity - aTheory), unit: 'N' })
        theory.push({ label: 'Time to floor (theory)', value: aTheory > 0 ? Math.sqrt((2 * DROP_HEIGHT) / aTheory) : Infinity, unit: 's' })
        theory.push({ label: 'Time to floor (simulated)', value: model.finished === 'floor' ? model.time : Number.NaN, unit: 's' })
      }
      return [
        {
          title: 'Motion',
          items: [
            { label: p.scenario === 'push' ? 'Position x' : 'Distance moved', value: x, unit: 'm' },
            { label: 'Velocity v', value: v, unit: 'm/s' },
            { label: 'Acceleration a', value: a, unit: 'm/s²' },
          ],
        },
        {
          title: 'Forces on the block',
          items: [
            p.scenario === 'push'
              ? { label: 'Applied force F', value: f.pulling, unit: 'N' }
              : { label: 'String tension T', value: f.tension, unit: 'N' },
            { label: 'Friction f', value: f.friction, unit: 'N' },
            { label: 'Friction regime', text: f.frictionKind, unit: '' },
            { label: 'Normal force N', value: f.normal, unit: 'N' },
            { label: 'Weight m₁g', value: f.weight, unit: 'N' },
            { label: 'Net horizontal force', value: f.net, unit: 'N' },
          ],
        },
        {
          title: 'Newton’s second law',
          items: [
            { label: 'Net external force on system', value: p.scenario === 'push' ? f.net : f.hangingWeight + f.friction, unit: 'N' },
            { label: 'Moving mass × acceleration', value: movingMass * a, unit: 'N', description: 'Equal by construction: the model computes a from the net force.' },
          ],
        },
        { title: 'Theory', items: theory },
      ]
    },
    notices() {
      const p = model.parameters
      const notices: string[] = []
      if (p.kineticFriction > p.staticFriction) notices.push('μk exceeds μs; it is clamped to μs, because Coulomb friction with μk > μs is not consistent.')
      if (p.scenario === 'push') notices.push('The applied force can be changed while running — try removing it and watching friction stop the block.')
      if (model.finished === 'track-end') notices.push(`The block reached the end of the ${TRACK_HALF_LENGTH} m track.`)
      if (model.finished === 'floor') notices.push('The hanging mass reached the floor; the string goes slack and the run ends.')
      return notices
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const p = model.parameters
      const f = model.forces()
      const [x] = model.state
      const maxForce = Math.max(Math.abs(f.pulling), Math.abs(f.friction), f.weight, f.hangingWeight, 1e-9)

      if (p.scenario === 'push') {
        const vp = fitViewport({ xMin: x - 6, xMax: x + 6, yMin: -3, yMax: 3.4 }, width, height)
        drawGrid(ctx, vp, palette)
        ctx.strokeStyle = palette.muted
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, vp.toY(0))
        ctx.lineTo(width, vp.toY(0))
        for (const end of [-TRACK_HALF_LENGTH, TRACK_HALF_LENGTH]) {
          ctx.moveTo(vp.toX(end), vp.toY(0))
          ctx.lineTo(vp.toX(end), vp.toY(1))
        }
        ctx.stroke()
        const w = 1
        const h = 0.6
        drawBlock(ctx, vp, x - w / 2, 0, w, h, '', palette)
        const L = (force: number) => (2.4 * force) / maxForce
        const cx = vp.toX(x)
        const cy = vp.toY(h / 2)
        drawArrow(ctx, cx, vp.toY(h), cx, vp.toY(h + L(f.normal)), palette.force, 'N')
        drawArrow(ctx, cx, vp.toY(0), cx, vp.toY(-L(f.weight)), palette.force, 'mg')
        if (f.pulling !== 0) {
          // Push drawn ending at the block face; label at the tail so it does not overlap the block.
          const tailX = vp.toX(x - Math.sign(f.pulling) * (w / 2 + L(Math.abs(f.pulling))))
          drawArrow(ctx, tailX, cy, vp.toX(x - Math.sign(f.pulling) * (w / 2)), cy, palette.force)
          drawLabel(ctx, 'F', tailX - 6, cy - 8, palette.force)
        }
        // Friction acts at the contact surface: drawn just below it, from the block's centre.
        if (f.friction !== 0) drawArrow(ctx, cx, vp.toY(-0.25), vp.toX(x + L(f.friction)), vp.toY(-0.25), palette.force, f.frictionKind === 'static' ? 'fₛ' : 'fₖ')
        return
      }

      // Pulley: block on a table edge, string over a pulley to a hanging mass.
      const vp = fitViewport({ xMin: -3.6, xMax: 1, yMin: -2.5, yMax: 1.6 }, width, height)
      const blockW = 0.6
      const blockH = 0.4
      const blockRight = -2.2 + x
      const pulley = { x: 0.12, y: 0.08, r: 0.12 }
      const hangTop = -0.3 - x
      const floorY = -0.3 - 0.4 - DROP_HEIGHT
      ctx.fillStyle = palette.grid
      ctx.fillRect(vp.toX(-3.4), vp.toY(0), (3.4) * vp.scale, 0.12 * vp.scale)
      ctx.strokeStyle = palette.muted
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(vp.toX(-1), vp.toY(floorY))
      ctx.lineTo(vp.toX(1), vp.toY(floorY))
      ctx.stroke()
      drawLabel(ctx, 'floor', vp.toX(0.5), vp.toY(floorY) + 16, palette.gridLabel)
      ctx.strokeStyle = palette.ink
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(vp.toX(blockRight), vp.toY(0.2))
      ctx.lineTo(vp.toX(pulley.x), vp.toY(0.2))
      ctx.moveTo(vp.toX(pulley.x + pulley.r), vp.toY(pulley.y))
      ctx.lineTo(vp.toX(pulley.x + pulley.r), vp.toY(hangTop))
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(vp.toX(pulley.x), vp.toY(pulley.y), pulley.r * vp.scale, 0, 2 * Math.PI)
      ctx.stroke()
      drawBlock(ctx, vp, blockRight - blockW, 0, blockW, blockH, 'm₁', palette)
      drawBlock(ctx, vp, pulley.x + pulley.r - 0.18, hangTop - 0.4, 0.36, 0.4, 'm₂', palette)
      const L = (force: number) => (0.9 * force) / maxForce
      const by = vp.toY(blockH / 2)
      drawArrow(ctx, vp.toX(blockRight), by, vp.toX(blockRight + L(f.tension)), by, palette.force, 'T')
      if (f.friction !== 0) drawArrow(ctx, vp.toX(blockRight - blockW), vp.toY(0.05), vp.toX(blockRight - blockW + L(f.friction)), vp.toY(0.05), palette.force, f.frictionKind === 'static' ? 'fₛ' : 'fₖ')
      const hx = vp.toX(pulley.x + pulley.r)
      drawArrow(ctx, hx + 26, vp.toY(hangTop - 0.4), hx + 26, vp.toY(hangTop - 0.4 - L(f.hangingWeight)), palette.force, 'm₂g')
      drawArrow(ctx, hx - 26, vp.toY(hangTop), hx - 26, vp.toY(hangTop + L(f.tension)), palette.force, 'T')
    },
  }
}

export const newtonsLawsSimulation: SimulationDefinition = {
  id: 'newtons-laws',
  dt: 1e-3,
  sampleInterval: () => 0.01,
  channels: [
    { key: 'x', label: 'x', unit: 'm' },
    { key: 'xTheory', label: 'x, theory ½at² (constant force from rest)', unit: 'm' },
    { key: 'v', label: 'v', unit: 'm/s' },
    { key: 'a', label: 'a', unit: 'm/s²' },
    { key: 'pulling', label: 'Applied force or tension', unit: 'N' },
    { key: 'friction', label: 'Friction', unit: 'N' },
    { key: 'net', label: 'Net force on block', unit: 'N' },
    { key: 'momentum', label: 'Block momentum m₁v', unit: 'kg·m/s' },
  ],
  charts: [
    { id: 'position', title: 'Position', unit: 'm', series: [{ key: 'x', color: 'position' }, { key: 'xTheory', color: 'theory', theory: true }] },
    { id: 'velocity', title: 'Velocity', unit: 'm/s', series: [{ key: 'v', color: 'velocity' }] },
    { id: 'acceleration', title: 'Acceleration', unit: 'm/s²', series: [{ key: 'a', color: 'acceleration' }] },
    {
      id: 'forces', title: 'Forces', unit: 'N',
      series: [{ key: 'pulling', color: 'force' }, { key: 'friction', color: 'momentum' }, { key: 'net', color: 'energy' }],
    },
    { id: 'momentum', title: 'Momentum', unit: 'kg·m/s', series: [{ key: 'momentum', color: 'momentum' }] },
  ],
  canvasDescription: 'A block with its free-body diagram: applied or tension force, friction, normal force and weight, drawn to scale.',
  parameters: [
    {
      kind: 'choice', key: 'scenario', label: 'Scenario', defaultValue: 'push',
      options: [
        { value: 'push', label: 'Block pushed on a surface' },
        { value: 'pulley', label: 'Block pulled by a hanging mass' },
      ],
    },
    { kind: 'number', key: 'mass', label: 'Block mass m₁', unit: 'kg', min: 0.1, max: 50, step: 0.1, defaultValue: 10 },
    { kind: 'number', key: 'appliedForce', label: 'Applied force F', unit: 'N', min: -200, max: 200, step: 1, defaultValue: 50, live: true, visibleWhen: isPush, description: 'Can be changed while running.' },
    { kind: 'number', key: 'hangingMass', label: 'Hanging mass m₂', unit: 'kg', min: 0.1, max: 50, step: 0.1, defaultValue: 6, visibleWhen: isPulley, description: 'Moves only if m₂g exceeds μs·m₁g.' },
    { kind: 'number', key: 'staticFriction', label: 'Static friction μs', unit: '', min: 0, max: 1.5, step: 0.01, defaultValue: 0.5 },
    { kind: 'number', key: 'kineticFriction', label: 'Kinetic friction μk', unit: '', min: 0, max: 1.5, step: 0.01, defaultValue: 0.3 },
    { kind: 'number', key: 'gravity', label: 'Gravity g', unit: 'm/s²', min: 0.5, max: 30, step: 0.01, defaultValue: 9.80665 },
  ],
  equations: [
    { label: 'Second law', expression: 'F_net = m a' },
    { label: 'Static friction', expression: '|fₛ| ≤ μs N   (balances the applied force)' },
    { label: 'Kinetic friction', expression: 'fₖ = μk N, opposing the motion' },
    { label: 'Normal force (level surface)', expression: 'N = m₁ g' },
    { label: 'Pulley system', expression: 'a = (m₂ g − μk m₁ g) / (m₁ + m₂),  T = m₂ (g − a)' },
  ],
  create: createInstance,
}
