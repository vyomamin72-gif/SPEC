import { borisStep, MU_0, traceFieldLine, wireField } from '@/physics/models/fields'
import type { LineCurrent } from '@/physics/models/fields'
import { clear, drawArrow, drawDisc, drawGrid, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import type { Viewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'
import { drawPolylines, drawVectorGrid } from '../shared/fieldView'

const SCENARIOS = ['single', 'parallel', 'antiparallel', 'solenoid', 'particle'] as const
const PARTICLES = { proton: { qm: 9.5788e7, label: 'proton', sign: 1 }, electron: { qm: -1.75882e11, label: 'electron', sign: -1 } }
const isParticle = (v: ParameterValues) => v.scenario === 'particle'
const isWires = (v: ParameterValues) => v.scenario !== 'particle'
const BOUNDS = { xMin: -0.2, xMax: 0.2, yMin: -0.14, yMax: 0.14 }

function wires(v: ParameterValues): LineCurrent[] {
  const I = num(v, 'current')
  const d = num(v, 'separation') / 100
  switch (choice(v, 'scenario', SCENARIOS)) {
    case 'single':
      return [{ current: I, x: 0, y: 0 }]
    case 'parallel':
      return [{ current: I, x: -d / 2, y: 0 }, { current: I, x: d / 2, y: 0 }]
    case 'antiparallel':
      return [{ current: I, x: -d / 2, y: 0 }, { current: -I, x: d / 2, y: 0 }]
    case 'solenoid':
      return Array.from({ length: 16 }, (_, k) => {
        const x = -0.12 + (0.24 * (k % 8)) / 7
        return { current: k < 8 ? I : -I, x, y: k < 8 ? d / 2 : -d / 2 }
      })
    default:
      return []
  }
}

function cm(vp: Viewport): Viewport {
  const c = 0.01
  return { scale: vp.scale * c, toX: (x) => vp.toX(x * c), toY: (y) => vp.toY(y * c), visible: { xMin: vp.visible.xMin / c, xMax: vp.visible.xMax / c, yMin: vp.visible.yMin / c, yMax: vp.visible.yMax / c } }
}

function closedLines(list: LineCurrent[]): [number, number][][] {
  const field = (x: number, y: number) => wireField(list, x, y)
  const seeds: [number, number][] = []
  if (list.length === 16) {
    // Solenoid: seeds across the interior (lines run parallel there) and outside each row.
    const inner = Math.abs(list[0].y) * 0.8
    for (let k = 0; k < 7; k++) seeds.push([0, -inner + (2 * inner * k) / 6])
    for (const y of [-0.12, -0.09, 0.09, 0.12]) seeds.push([0, y])
  } else {
    const xs = list.length === 1 ? [0.015, 0.03, 0.05, 0.075, 0.105, 0.14] : Array.from({ length: 12 }, (_, k) => -0.19 + (0.38 * (k + 0.5)) / 12)
    for (const x of xs) seeds.push(list.length === 1 ? [x, 0] : [x, 0.001])
  }
  const options = (start: [number, number], direction: 1 | -1) => {
    let steps = 0
    return {
      step: 0.0015,
      maxSteps: 2500,
      direction,
      bounds: { xMin: -0.5, xMax: 0.5, yMin: -0.4, yMax: 0.4 },
      stop: (x: number, y: number) => ++steps > 30 && Math.hypot(x - start[0], y - start[1]) < 0.0015,
    }
  }
  return seeds.map((start) => {
    const forward = traceFieldLine(field, start, options(start, 1))
    const [ex, ey] = forward[forward.length - 1]
    if (Math.hypot(ex - start[0], ey - start[1]) < 0.003) return forward // closed loop
    // Open within the traced region (e.g. along the axis): trace backwards too.
    return [...traceFieldLine(field, start, options(start, -1)).reverse(), ...forward.slice(1)]
  })
}

function createInstance(values: ParameterValues): SimulationInstance {
  const scenario = choice(values, 'scenario', SCENARIOS)
  const list = wires(values)
  const lines = scenario === 'particle' ? [] : closedLines(list)
  let view = choice(values, 'view', ['lines', 'vectors'] as const)
  let probe: [number, number] = [num(values, 'probeX') / 100, num(values, 'probeY') / 100]
  let time = 0
  // Charged particle in a uniform field B_z (out of the page) and optional E_y.
  const particle = PARTICLES[choice(values, 'particle', ['proton', 'electron'] as const)]
  const B = num(values, 'field') * 1e-3
  const E = num(values, 'electricField')
  const speed = num(values, 'speed') * 1e3
  const radius = speed / Math.abs(particle.qm * B)
  const period = (2 * Math.PI) / Math.abs(particle.qm * B)
  const state = Float64Array.from([0, particle.sign > 0 ? radius : -radius, speed, 0])
  const path: [number, number][] = []
  let yMin = Infinity
  let yMax = -Infinity
  let lastOrbitX = 0
  let orbits = 0
  let driftMeasured = Number.NaN

  return {
    get time() {
      return time
    },
    finished: false,
    isStatic: scenario !== 'particle',
    step(dt) {
      time += dt
      if (scenario !== 'particle') return
      borisStep(state, dt, particle.qm, [0, E], B)
      if (path.length === 0 || time % (period / 200) < dt) path.push([state[0], state[1]])
      if (path.length > 4000) path.shift()
      yMin = Math.min(yMin, state[1])
      yMax = Math.max(yMax, state[1])
      if (Math.floor(time / period) > orbits) {
        orbits = Math.floor(time / period)
        driftMeasured = (state[0] - lastOrbitX) / period
        lastOrbitX = state[0]
      }
    },
    update(next) {
      view = choice(next, 'view', ['lines', 'vectors'] as const)
      probe = [num(next, 'probeX') / 100, num(next, 'probeY') / 100]
    },
    sample() {
      return scenario === 'particle' ? [Math.hypot(state[2], state[3]) / 1e3, state[0] * 100, state[1] * 100] : [Number.NaN, Number.NaN, Number.NaN]
    },
    readouts() {
      if (scenario === 'particle') {
        return [
          {
            title: `${particle.label[0].toUpperCase()}${particle.label.slice(1)} in B = ${(B * 1e3).toFixed(2)} mT`,
            items: [
              { label: 'Radius r = mv/(|q|B)', value: radius * 100, unit: 'cm' },
              { label: 'Radius (measured)', value: Number.isFinite(yMax - yMin) && orbits > 0 && E === 0 ? ((yMax - yMin) / 2) * 100 : Number.NaN, unit: 'cm', description: 'Half the vertical extent of the path after one orbit (no E field)' },
              { label: 'Period 2πm/(|q|B)', value: period * 1e6, unit: 'µs' },
              { label: 'Speed (magnetic force does no work)', value: Math.hypot(state[2], state[3]) / 1e3, unit: 'km/s' },
              { label: 'E × B drift speed E/B (theory)', value: E / B / 1e3, unit: 'km/s' },
              { label: 'Drift speed (measured, last orbit)', value: E !== 0 ? Math.abs(driftMeasured) / 1e3 : Number.NaN, unit: 'km/s' },
            ],
          },
        ]
      }
      const [bx, by] = wireField(list, ...probe)
      const items = [
        { label: 'Field strength |B|', value: Math.hypot(bx, by) * 1e6, unit: 'µT' },
        { label: 'Direction (from +x)', value: (Math.atan2(by, bx) * 180) / Math.PI, unit: '°' },
      ]
      if (list.length === 2) {
        const d = Math.abs(list[1].x - list[0].x)
        const f = (MU_0 * list[0].current * list[1].current) / (2 * Math.PI * d)
        items.push({ label: f > 0 ? 'Attractive force per metre' : 'Repulsive force per metre', value: Math.abs(f) * 1e6, unit: 'µN/m' })
      }
      if (list.length === 1) items.push({ label: 'μ₀I/(2πr) at the probe', value: ((MU_0 * list[0].current) / (2 * Math.PI * Math.hypot(...probe))) * 1e6, unit: 'µT' })
      if (list.length === 16) items.push({ label: 'Ideal-solenoid estimate μ₀nI (n = 8 wires / 24 cm)', value: MU_0 * (8 / 0.24) * Math.abs(list[0].current) * 1e6, unit: 'µT' })
      return [{ title: `Probe at (${(probe[0] * 100).toFixed(1)}, ${(probe[1] * 100).toFixed(1)}) cm`, items }]
    },
    notices() {
      if (scenario === 'particle') return ['Uniform field out of the page. The Boris integrator rotates the velocity exactly, so the speed stays constant to round-off: the magnetic force never does work.', ...(E !== 0 ? ['With an electric field added, the orbit drifts sideways at E/B, perpendicular to both fields, whatever the charge or mass.'] : [])]
      return ['Long straight wires perpendicular to the page (⊙ current out of the page, ⊗ into it). Field lines close on themselves: there are no magnetic charges.', ...(list.length === 16 ? ['Eight wires per side only approximate an infinite solenoid: the field inside is close to uniform but not exactly μ₀nI.'] : [])]
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      if (scenario === 'particle') {
        const extent = Math.max(2.4 * radius, 0.05)
        const vp = fitViewport({ xMin: -extent, xMax: extent * 2, yMin: -extent, yMax: extent }, width, height)
        drawGrid(ctx, cm(vp), palette, 'cm')
        for (let x = vp.visible.xMin; x < vp.visible.xMax; x += extent / 3) {
          for (let y = vp.visible.yMin; y < vp.visible.yMax; y += extent / 3) drawLabel(ctx, '⊙', vp.toX(x) - 5, vp.toY(y) + 4, palette.grid)
        }
        drawPolylines(ctx, vp, [path], palette.position)
        const v = Math.hypot(state[2], state[3]) || 1
        drawArrow(ctx, vp.toX(state[0]), vp.toY(state[1]), vp.toX(state[0]) + (40 * state[2]) / v, vp.toY(state[1]) - (40 * state[3]) / v, palette.velocity, 'v')
        drawDisc(ctx, vp.toX(state[0]), vp.toY(state[1]), 5, particle.sign > 0 ? palette.momentum : palette.position)
        drawLabel(ctx, 'B out of the page (⊙)', 8, 18, palette.gridLabel)
        return
      }
      const vp = fitViewport(BOUNDS, width, height, 12)
      drawGrid(ctx, cm(vp), palette, 'cm')
      if (view === 'lines') drawPolylines(ctx, vp, lines, palette.muted)
      else drawVectorGrid(ctx, vp, (x, y) => wireField(list, x, y), 26, palette.muted)
      for (const w of list) {
        drawDisc(ctx, vp.toX(w.x), vp.toY(w.y), 8, w.current > 0 ? palette.momentum : palette.position)
        drawLabel(ctx, w.current > 0 ? '⊙' : '⊗', vp.toX(w.x) - 5, vp.toY(w.y) + 4, palette.background)
      }
      const [bx, by] = wireField(list, ...probe)
      const m = Math.hypot(bx, by) || 1
      drawArrow(ctx, vp.toX(probe[0]), vp.toY(probe[1]), vp.toX(probe[0]) + (40 * bx) / m, vp.toY(probe[1]) - (40 * by) / m, palette.force, 'B')
      drawDisc(ctx, vp.toX(probe[0]), vp.toY(probe[1]), 3, palette.force)
    },
  }
}

export const magneticFieldSimulation: SimulationDefinition = {
  id: 'magnetic-field',
  dt: 1e-9,
  timestep: (v) => (isParticle(v) ? (2 * Math.PI) / Math.abs(PARTICLES[v.particle as 'proton' | 'electron'].qm * num(v, 'field') * 1e-3) / 400 : 1e-3),
  clock: (v) =>
    isParticle(v)
      ? { unit: 'µs', secondsPerUnit: 1e-6, unitsPerRealSecond: Math.max(0.01, (2 * Math.PI) / Math.abs(PARTICLES[v.particle as 'proton' | 'electron'].qm * num(v, 'field') * 1e-3) / 1e-6 / 4) }
      : { unit: 's', secondsPerUnit: 1, unitsPerRealSecond: 1 },
  canvasDescription: 'Magnetic field lines around current-carrying wires, or a charged particle circling in a uniform magnetic field.',
  parameters: [
    { kind: 'choice', key: 'scenario', label: 'Scenario', defaultValue: 'single', options: [{ value: 'single', label: 'Single wire' }, { value: 'parallel', label: 'Two wires, same direction' }, { value: 'antiparallel', label: 'Two wires, opposite directions' }, { value: 'solenoid', label: 'Solenoid (cross-section)' }, { value: 'particle', label: 'Charged particle in a uniform field' }] },
    { kind: 'number', key: 'current', label: 'Current I', unit: 'A', min: 0.1, max: 50, step: 0.1, defaultValue: 10, visibleWhen: isWires },
    { kind: 'number', key: 'separation', label: 'Wire separation', unit: 'cm', min: 2, max: 20, step: 0.5, defaultValue: 8, visibleWhen: isWires },
    { kind: 'choice', key: 'view', label: 'Show', defaultValue: 'lines', live: true, visibleWhen: isWires, options: [{ value: 'lines', label: 'Field lines' }, { value: 'vectors', label: 'Field vectors' }] },
    { kind: 'number', key: 'probeX', label: 'Probe x', unit: 'cm', min: -20, max: 20, step: 0.5, defaultValue: 3, live: true, visibleWhen: isWires },
    { kind: 'number', key: 'probeY', label: 'Probe y', unit: 'cm', min: -14, max: 14, step: 0.5, defaultValue: 4, live: true, visibleWhen: isWires },
    { kind: 'choice', key: 'particle', label: 'Particle', defaultValue: 'proton', visibleWhen: isParticle, options: [{ value: 'proton', label: 'Proton' }, { value: 'electron', label: 'Electron' }] },
    { kind: 'number', key: 'field', label: 'Magnetic field B', unit: 'mT', min: 0.01, max: 50, step: 0.01, defaultValue: 10, visibleWhen: isParticle },
    { kind: 'number', key: 'speed', label: 'Speed v', unit: 'km/s', min: 1, max: 5000, step: 1, defaultValue: 100, visibleWhen: isParticle },
    { kind: 'number', key: 'electricField', label: 'Electric field E (along y)', unit: 'V/m', min: 0, max: 1000, step: 1, defaultValue: 0, visibleWhen: isParticle },
  ],
  equations: [
    { label: 'Long straight wire', expression: 'B = μ₀ I / (2π r)' },
    { label: 'Force between wires', expression: 'F/L = μ₀ I₁ I₂ / (2π d)' },
    { label: 'Lorentz force', expression: 'F = q (E + v × B)' },
    { label: 'Cyclotron motion', expression: 'r = m v / (|q| B),  T = 2π m / (|q| B)' },
  ],
  sampleInterval: (v) => (isParticle(v) ? (2 * Math.PI) / Math.abs(PARTICLES[v.particle as 'proton' | 'electron'].qm * num(v, 'field') * 1e-3) / 100 : 0.01),
  channels: [
    { key: 'speed', label: 'Particle speed', unit: 'km/s' },
    { key: 'x', label: 'Particle x', unit: 'cm' },
    { key: 'y', label: 'Particle y', unit: 'cm' },
  ],
  charts: [
    { id: 'position', title: 'Particle position', unit: 'cm', series: [{ key: 'x', color: 'position' }, { key: 'y', color: 'momentum' }] },
    { id: 'speed', title: 'Particle speed', unit: 'km/s', series: [{ key: 'speed', color: 'velocity' }] },
  ],
  create: createInstance,
}
