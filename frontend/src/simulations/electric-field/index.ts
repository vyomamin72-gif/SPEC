import { createRk4 } from '@/physics/core/integrators'
import { electricField, electricPotential, traceFieldLine } from '@/physics/models/fields'
import type { PointCharge } from '@/physics/models/fields'
import { COULOMB_CONSTANT as K } from '@/physics/models/nbody'
import { clear, drawArrow, drawDisc, drawGrid, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import type { Viewport } from '@/rendering/viewport'
import { bool, choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'
import { drawPolylines, drawVectorGrid } from '../shared/fieldView'

const NANO = 1e-9
const BOUNDS = { xMin: -0.25, xMax: 0.25, yMin: -0.18, yMax: 0.18 }
const PRESETS = ['single', 'dipole', 'like', 'unequal', 'quadrupole'] as const
const TEST_CHARGE = 1e-9 // C
const TEST_MASS = 1e-6 // kg

function charges(v: ParameterValues): PointCharge[] {
  const q = num(v, 'charge') * NANO
  const d = num(v, 'separation') / 100
  switch (choice(v, 'preset', PRESETS)) {
    case 'single':
      return [{ q, x: 0, y: 0 }]
    case 'dipole':
      return [{ q, x: -d / 2, y: 0 }, { q: -q, x: d / 2, y: 0 }]
    case 'like':
      return [{ q, x: -d / 2, y: 0 }, { q, x: d / 2, y: 0 }]
    case 'unequal':
      return [{ q: 2 * q, x: -d / 2, y: 0 }, { q: -q, x: d / 2, y: 0 }]
    case 'quadrupole':
      return [{ q, x: -d / 2, y: d / 2 }, { q: -q, x: d / 2, y: d / 2 }, { q, x: d / 2, y: -d / 2 }, { q: -q, x: -d / 2, y: -d / 2 }]
  }
}

function fieldLines(list: PointCharge[]): [number, number][][] {
  const field = (x: number, y: number) => electricField(list, x, y)
  const near = (x: number, y: number) => list.some((c) => Math.hypot(x - c.x, y - c.y) < 0.004)
  const sources = list.some((c) => c.q > 0) ? list.filter((c) => c.q > 0) : list
  const qMax = Math.max(...sources.map((c) => Math.abs(c.q)))
  const lines: [number, number][][] = []
  for (const c of sources) {
    const count = Math.round(16 * (Math.abs(c.q) / qMax))
    for (let k = 0; k < count; k++) {
      const a = (2 * Math.PI * (k + 0.5)) / count
      lines.push(
        traceFieldLine(field, [c.x + 0.006 * Math.cos(a), c.y + 0.006 * Math.sin(a)], {
          step: 0.002,
          maxSteps: 1500,
          direction: c.q > 0 ? 1 : -1,
          bounds: { xMin: -0.6, xMax: 0.6, yMin: -0.45, yMax: 0.45 },
          stop: near,
        }),
      )
    }
  }
  return lines
}

function cmViewport(vp: Viewport): Viewport {
  const cm = 0.01
  return { scale: vp.scale * cm, toX: (x) => vp.toX(x * cm), toY: (y) => vp.toY(y * cm), visible: { xMin: vp.visible.xMin / cm, xMax: vp.visible.xMax / cm, yMin: vp.visible.yMin / cm, yMax: vp.visible.yMax / cm } }
}

function createInstance(values: ParameterValues): SimulationInstance {
  const list = charges(values)
  const lines = fieldLines(list)
  let view = choice(values, 'view', ['lines', 'vectors'] as const)
  let probe: [number, number] = [num(values, 'probeX') / 100, num(values, 'probeY') / 100]
  let time = 0
  /** Released test charge: [x, y, vx, vy]. */
  let test: Float64Array | null = null
  let testStartPotential = 0
  let testDone = false
  const rk4 = createRk4(4, (_t, y, dy) => {
    const [ex, ey] = electricField(list, y[0], y[1])
    dy[0] = y[2]
    dy[1] = y[3]
    dy[2] = (TEST_CHARGE * ex) / TEST_MASS
    dy[3] = (TEST_CHARGE * ey) / TEST_MASS
  })
  const release = (on: boolean) => {
    test = on ? Float64Array.from([probe[0], probe[1], 0, 0]) : null
    testDone = false
    testStartPotential = on ? electricPotential(list, probe[0], probe[1]) : 0
  }
  release(bool(values, 'testCharge'))
  const path: [number, number][] = []

  return {
    get time() {
      return time
    },
    finished: false,
    get isStatic() {
      return !test || testDone
    },
    step(dt) {
      time += dt
      if (!test || testDone) return
      const t = test
      rk4(time, t, dt)
      path.push([t[0], t[1]])
      const close = list.some((c) => Math.hypot(t[0] - c.x, t[1] - c.y) < 0.005)
      const out = t[0] < BOUNDS.xMin || t[0] > BOUNDS.xMax || t[1] < BOUNDS.yMin || t[1] > BOUNDS.yMax
      if (close || out) testDone = true
    },
    update(next) {
      view = choice(next, 'view', ['lines', 'vectors'] as const)
      probe = [num(next, 'probeX') / 100, num(next, 'probeY') / 100]
      const wanted = bool(next, 'testCharge')
      if (wanted !== (test !== null)) {
        path.length = 0
        release(wanted)
      }
    },
    sample() {
      if (!test) return [Number.NaN, Number.NaN, Number.NaN]
      const ke = 0.5 * TEST_MASS * (test[2] ** 2 + test[3] ** 2)
      const lost = TEST_CHARGE * (testStartPotential - electricPotential(list, test[0], test[1]))
      return [Math.hypot(test[2], test[3]), ke * 1e9, lost * 1e9]
    },
    readouts() {
      const [ex, ey] = electricField(list, ...probe)
      const nearest = list.reduce((a, b) => (Math.hypot(probe[0] - a.x, probe[1] - a.y) < Math.hypot(probe[0] - b.x, probe[1] - b.y) ? a : b))
      const r = Math.hypot(probe[0] - nearest.x, probe[1] - nearest.y)
      const groups = [
        {
          title: `Probe at (${(probe[0] * 100).toFixed(1)}, ${(probe[1] * 100).toFixed(1)}) cm`,
          items: [
            { label: 'Field strength |E|', value: Math.hypot(ex, ey), unit: 'V/m' },
            { label: 'Direction (from +x)', value: (Math.atan2(ey, ex) * 180) / Math.PI, unit: '°' },
            { label: 'Potential V', value: electricPotential(list, ...probe), unit: 'V' },
            { label: 'Nearest charge alone, k|q|/r²', value: (K * Math.abs(nearest.q)) / (r * r), unit: 'V/m', description: 'Compare with the full field: the difference is the other charges’ contribution (superposition).' },
          ],
        },
      ]
      if (test) {
        const ke = 0.5 * TEST_MASS * (test[2] ** 2 + test[3] ** 2)
        const work = TEST_CHARGE * (testStartPotential - electricPotential(list, test[0], test[1]))
        groups.push({
          title: 'Test charge (+1 nC, 1 mg)',
          items: [
            { label: 'Speed', value: Math.hypot(test[2], test[3]), unit: 'm/s' },
            { label: 'Kinetic energy', value: ke * 1e9, unit: 'nJ' },
            { label: 'Work by the field q(V₀ − V)', value: work * 1e9, unit: 'nJ', description: 'Energy conservation: equals the kinetic energy gained' },
          ],
        })
      }
      return groups
    },
    notices() {
      const n = ['Static charges: the field is computed exactly by superposition; only the field lines are traced numerically.']
      if (test) n.push('A released charge does not follow the field line through its start point: it has inertia, and the force sets its acceleration, not its velocity.')
      else n.push('Tick “Release a test charge” to watch a positive test charge move from the probe point.')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport(BOUNDS, width, height, 12)
      drawGrid(ctx, cmViewport(vp), palette, 'cm')
      if (view === 'lines') drawPolylines(ctx, vp, lines, palette.muted)
      else drawVectorGrid(ctx, vp, (x, y) => electricField(list, x, y), 28, palette.muted)
      for (const c of list) {
        drawDisc(ctx, vp.toX(c.x), vp.toY(c.y), 9, c.q > 0 ? palette.momentum : palette.position)
        drawLabel(ctx, c.q > 0 ? '+' : '−', vp.toX(c.x) - 4, vp.toY(c.y) + 4, palette.background)
      }
      const [ex, ey] = electricField(list, ...probe)
      const m = Math.hypot(ex, ey) || 1
      drawArrow(ctx, vp.toX(probe[0]), vp.toY(probe[1]), vp.toX(probe[0]) + (40 * ex) / m, vp.toY(probe[1]) - (40 * ey) / m, palette.force, 'E')
      drawDisc(ctx, vp.toX(probe[0]), vp.toY(probe[1]), 3, palette.force)
      if (test) {
        ctx.strokeStyle = palette.energy
        ctx.lineWidth = 2
        ctx.beginPath()
        path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(vp.toX(x), vp.toY(y)) : ctx.lineTo(vp.toX(x), vp.toY(y))))
        ctx.stroke()
        drawDisc(ctx, vp.toX(test[0]), vp.toY(test[1]), 5, palette.energy)
      }
    },
  }
}

export const electricFieldSimulation: SimulationDefinition = {
  id: 'electric-field',
  dt: 2e-4,
  canvasDescription: 'Point charges with their electric field lines or field vectors, a probe point, and an optional moving test charge.',
  parameters: [
    { kind: 'choice', key: 'preset', label: 'Charges', defaultValue: 'dipole', options: [{ value: 'single', label: 'Single charge' }, { value: 'dipole', label: 'Dipole (+q, −q)' }, { value: 'like', label: 'Two like charges' }, { value: 'unequal', label: '+2q and −q' }, { value: 'quadrupole', label: 'Quadrupole' }] },
    { kind: 'number', key: 'charge', label: 'Charge magnitude q', unit: 'nC', min: 0.1, max: 10, step: 0.1, defaultValue: 1 },
    { kind: 'number', key: 'separation', label: 'Separation d', unit: 'cm', min: 2, max: 30, step: 0.5, defaultValue: 10 },
    { kind: 'choice', key: 'view', label: 'Show', defaultValue: 'lines', live: true, options: [{ value: 'lines', label: 'Field lines' }, { value: 'vectors', label: 'Field vectors' }] },
    { kind: 'number', key: 'probeX', label: 'Probe x', unit: 'cm', min: -25, max: 25, step: 0.5, defaultValue: 0, live: true },
    { kind: 'number', key: 'probeY', label: 'Probe y', unit: 'cm', min: -18, max: 18, step: 0.5, defaultValue: 6, live: true },
    { kind: 'boolean', key: 'testCharge', label: 'Release a test charge at the probe', defaultValue: false, live: true },
  ],
  equations: [
    { label: 'Coulomb field', expression: 'E = k q / r²  (radial)' },
    { label: 'Superposition', expression: 'E = Σᵢ k qᵢ (r − rᵢ) / |r − rᵢ|³' },
    { label: 'Potential', expression: 'V = Σᵢ k qᵢ / |r − rᵢ|' },
    { label: 'Gauss’s law', expression: '∮ E · dA = Q_enclosed / ε₀' },
  ],
  sampleInterval: () => 0.002,
  channels: [
    { key: 'speed', label: 'Test charge speed', unit: 'm/s' },
    { key: 'ke', label: 'Test charge kinetic energy', unit: 'nJ' },
    { key: 'work', label: 'Work done by the field', unit: 'nJ' },
  ],
  charts: [
    { id: 'energy', title: 'Test charge energy', unit: 'nJ', series: [{ key: 'ke', color: 'velocity' }, { key: 'work', color: 'theory', theory: true }] },
    { id: 'speed', title: 'Test charge speed', unit: 'm/s', series: [{ key: 'speed', color: 'velocity' }] },
  ],
  create: createInstance,
}
