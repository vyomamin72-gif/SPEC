import { COULOMB_CONSTANT as K, NBodyModel } from '@/physics/models/nbody'
import type { PointBody } from '@/physics/models/nbody'
import { clear, drawArrow, drawDisc, drawGrid, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'
import { Trails } from '../shared/trails'

const SCENARIOS = ['pair', 'orbit', 'three'] as const
const isThree = (v: ParameterValues) => v.scenario === 'three'
const isOrbit = (v: ParameterValues) => v.scenario === 'orbit'
const MICRO = 1e-6

function bodies(v: ParameterValues): PointBody[] {
  const scenario = choice(v, 'scenario', SCENARIOS)
  const m = num(v, 'mass') * 1e-3
  const d = num(v, 'separation') / 100
  const q1 = num(v, 'q1') * MICRO
  const q2 = num(v, 'q2') * MICRO
  if (scenario === 'orbit') {
    // Light charge in a circular orbit around a heavy charge of opposite sign: v = √(k|q₁q₂| / (m r)).
    const qh = Math.abs(q1)
    const ql = -Math.abs(q2)
    const speed = Math.sqrt((K * qh * Math.abs(ql)) / (m * d)) * num(v, 'speedFactor')
    return [
      { name: '+Q', mass: 1000 * m, charge: qh, x: 0, y: 0, vx: 0, vy: 0 },
      { name: '−q', mass: m, charge: ql, x: d, y: 0, vx: 0, vy: speed },
    ]
  }
  const list: PointBody[] = [
    { name: 'q₁', mass: m, charge: q1, x: -d / 2, y: 0, vx: 0, vy: 0 },
    { name: 'q₂', mass: m, charge: q2, x: d / 2, y: 0, vx: 0, vy: 0 },
  ]
  if (scenario === 'three') list.push({ name: 'q₃', mass: m, charge: num(v, 'q3') * MICRO, x: 0, y: (d * Math.sqrt(3)) / 2, vx: 0, vy: 0 })
  return list
}

function createInstance(values: ParameterValues): SimulationInstance {
  const scenario = choice(values, 'scenario', SCENARIOS)
  const d = num(values, 'separation') / 100
  const model = new NBodyModel({ bodies: bodies(values), interaction: 'coulomb', softening: num(values, 'softening') / 1000, integrator: 'rk4', centreOfMassFrame: true })
  const e0 = model.kineticEnergy() + model.potentialEnergy()
  const trails = new Trails(model.n, Array(model.n).fill(1e-3), 1500)
  const extent = scenario === 'orbit' ? 1.6 * d : 2.2 * d
  let escaped = false
  const distance = (i: number, j: number) => Math.hypot(model.position(i)[0] - model.position(j)[0], model.position(i)[1] - model.position(j)[1])

  return {
    get time() {
      return model.time
    },
    get finished() {
      return escaped
    },
    step(dt) {
      model.step(dt)
      trails.record(model.time, (i) => model.position(i))
      for (let i = 0; i < model.n; i++) if (Math.hypot(...model.position(i)) > 6 * extent) escaped = true
    },
    sample() {
      const k = model.kineticEnergy()
      const u = model.potentialEnergy()
      return [distance(0, 1) * 100, k * 1000, u * 1000, (k + u) * 1000]
    },
    readouts() {
      const r = distance(0, 1)
      const q1 = model.bodies[0].charge ?? 0
      const q2 = model.bodies[1].charge ?? 0
      const f = model.forces()
      const e = model.kineticEnergy() + model.potentialEnergy()
      return [
        {
          title: 'Charges 1 and 2',
          items: [
            { label: 'Separation r', value: r * 100, unit: 'cm' },
            { label: 'Coulomb force k|q₁q₂|/r²', value: (K * Math.abs(q1 * q2)) / (r * r), unit: 'N' },
            { label: 'Interaction', text: q1 * q2 > 0 ? 'repulsive (like charges)' : q1 * q2 < 0 ? 'attractive (opposite charges)' : 'none', unit: '' },
            { label: 'Net force on body 1', value: Math.hypot(f[0], f[1]), unit: 'N' },
          ],
        },
        {
          title: 'Energy',
          items: [
            { label: 'Kinetic', value: model.kineticEnergy() * 1000, unit: 'mJ' },
            { label: 'Electric potential energy Σkqᵢqⱼ/rᵢⱼ', value: model.potentialEnergy() * 1000, unit: 'mJ' },
            { label: 'Total energy change', value: e0 !== 0 ? ((e - e0) / Math.abs(e0)) * 1e6 : Number.NaN, unit: 'ppm', description: 'Constant in reality: any change is integrator error.' },
          ],
        },
      ]
    },
    notices() {
      const n = ['Charges move on a frictionless plane. Magnetic forces between moving charges and radiation are neglected (valid for speeds far below c).']
      if (num(values, 'softening') > 0) n.push('Softening is on: forces are weakened at very short range to keep the numbers finite. Real point charges have no such limit.')
      if (escaped) n.push('A charge left the region; the run has ended.')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport({ xMin: -extent, xMax: extent, yMin: -extent, yMax: extent }, width, height)
      const cm = 0.01
      drawGrid(ctx, { scale: vp.scale * cm, toX: (x) => vp.toX(x * cm), toY: (y) => vp.toY(y * cm), visible: { xMin: vp.visible.xMin / cm, xMax: vp.visible.xMax / cm, yMin: vp.visible.yMin / cm, yMax: vp.visible.yMax / cm } }, palette, 'cm')
      const f = model.forces()
      const fMax = Math.max(...Array.from({ length: model.n }, (_, i) => Math.hypot(f[2 * i], f[2 * i + 1])), 1e-30)
      for (let i = 0; i < model.n; i++) {
        const q = model.bodies[i].charge ?? 0
        const color = q > 0 ? palette.momentum : palette.position
        const pos = model.position(i)
        trails.draw(ctx, vp, i, color, pos)
        const L = (0.35 * extent) / fMax
        drawArrow(ctx, vp.toX(pos[0]), vp.toY(pos[1]), vp.toX(pos[0] + f[2 * i] * L), vp.toY(pos[1] + f[2 * i + 1] * L), palette.force, 'F')
        drawDisc(ctx, vp.toX(pos[0]), vp.toY(pos[1]), 9, color)
        drawLabel(ctx, q > 0 ? '+' : q < 0 ? '−' : '0', vp.toX(pos[0]) - 4, vp.toY(pos[1]) + 4, palette.background)
        drawLabel(ctx, `${(q / MICRO).toFixed(1)} µC`, vp.toX(pos[0]) + 12, vp.toY(pos[1]) - 10, palette.ink)
      }
    },
  }
}

export const coulombSimulation: SimulationDefinition = {
  id: 'coulomb-interactions',
  dt: 2e-5,
  canvasDescription: 'Charged spheres on a plane, coloured by sign, with Coulomb force vectors and their paths.',
  clock: () => ({ unit: 's', secondsPerUnit: 1, unitsPerRealSecond: 0.1 }),
  parameters: [
    { kind: 'choice', key: 'scenario', label: 'Scenario', defaultValue: 'pair', options: [{ value: 'pair', label: 'Two charges released from rest' }, { value: 'orbit', label: 'Light charge orbiting a heavy one' }, { value: 'three', label: 'Three charges' }] },
    { kind: 'number', key: 'q1', label: 'Charge q₁', unit: 'µC', min: -5, max: 5, step: 0.1, defaultValue: 1 },
    { kind: 'number', key: 'q2', label: 'Charge q₂', unit: 'µC', min: -5, max: 5, step: 0.1, defaultValue: 1 },
    { kind: 'number', key: 'q3', label: 'Charge q₃', unit: 'µC', min: -5, max: 5, step: 0.1, defaultValue: -1, visibleWhen: isThree },
    { kind: 'number', key: 'mass', label: 'Mass of each charge', unit: 'g', min: 1, max: 100, step: 1, defaultValue: 10 },
    { kind: 'number', key: 'separation', label: 'Initial separation', unit: 'cm', min: 2, max: 30, step: 0.5, defaultValue: 10 },
    { kind: 'number', key: 'speedFactor', label: 'Orbital speed × circular', unit: '', min: 0.3, max: 1.5, step: 0.01, defaultValue: 1, visibleWhen: isOrbit, description: 'Below 1 the orbit is an ellipse; above √2 the charge escapes.' },
    { kind: 'number', key: 'softening', label: 'Softening length', unit: 'mm', min: 0, max: 10, step: 0.5, defaultValue: 2 },
  ],
  equations: [
    { label: 'Coulomb’s law', expression: 'F = k q₁ q₂ / r²,  k = 8.988 × 10⁹ N·m²/C²' },
    { label: 'Potential energy', expression: 'U = k q₁ q₂ / r' },
    { label: 'Circular orbit', expression: 'v = √(k |q₁ q₂| / (m r))' },
  ],
  sampleInterval: () => 0.001,
  channels: [
    { key: 'separation', label: 'Separation of charges 1 and 2', unit: 'cm' },
    { key: 'ke', label: 'Kinetic energy', unit: 'mJ' },
    { key: 'pe', label: 'Potential energy', unit: 'mJ' },
    { key: 'energy', label: 'Total energy', unit: 'mJ' },
  ],
  charts: [
    { id: 'separation', title: 'Separation', unit: 'cm', series: [{ key: 'separation', color: 'position' }] },
    { id: 'energy', title: 'Energy', unit: 'mJ', series: [{ key: 'ke', color: 'velocity' }, { key: 'pe', color: 'position' }, { key: 'energy', color: 'energy' }] },
  ],
  create: createInstance,
}
