import { elementsToState, keplerPeriod } from '@/physics/analysis/kepler'
import { OrbitTracker } from '@/physics/analysis/orbitTracker'
import { GRAVITATIONAL_CONSTANT as G, NBodyModel } from '@/physics/models/nbody'
import type { PointBody } from '@/physics/models/nbody'
import { ASTRONOMICAL_UNIT, DAY, SOLAR_MASS } from '@/physics/models/solarSystem'
import { clear, drawArrow, drawDisc, drawGrid, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, ReadoutItem, SimulationDefinition, SimulationInstance } from '../types'
import { Trails } from '../shared/trails'

type Scenario = 'planet-moon' | 'binary' | 'figure-eight'
const SCENARIOS = ['planet-moon', 'binary', 'figure-eight'] as const
const notFigureEight = (v: ParameterValues) => v.scenario !== 'figure-eight'

/** Natural time unit for the figure-eight solution scaled to 1 M☉ and 1 AU: √(AU³ / (G M☉)). */
const T0 = Math.sqrt(ASTRONOMICAL_UNIT ** 3 / (G * SOLAR_MASS))
/** Period of the Chenciner–Montgomery figure-eight in units where G = m = 1. */
const FIGURE_EIGHT_PERIOD = 6.32591398

interface Setup {
  bodies: PointBody[]
  /** Semi-major axis of the relative orbit (two-body scenarios), m. */
  a: number
  /** Characteristic period, s. */
  period: number
  extent: number
}

function setup(v: ParameterValues): Setup {
  const scenario = choice(v, 'scenario', SCENARIOS)
  const e = num(v, 'eccentricity')
  const factor = num(v, 'massFactor')
  if (scenario === 'figure-eight') {
    const L = ASTRONOMICAL_UNIT
    const V = L / T0
    const p = [-0.97000436, 0.24308753]
    const v3 = [-0.93240737, -0.86473146]
    const bodies = [
      { name: 'A', x: p[0] * L, y: p[1] * L, vx: (-v3[0] / 2) * V, vy: (-v3[1] / 2) * V },
      { name: 'B', x: -p[0] * L, y: -p[1] * L, vx: (-v3[0] / 2) * V, vy: (-v3[1] / 2) * V },
      { name: 'C', x: 0, y: 0, vx: v3[0] * V, vy: v3[1] * V },
    ].map((b) => ({ ...b, mass: SOLAR_MASS }))
    return { bodies, a: Number.NaN, period: FIGURE_EIGHT_PERIOD * T0, extent: 1.25 * L }
  }
  const [m1, m2, a, names] =
    scenario === 'planet-moon'
      ? [5.972e24, 7.342e22 * factor, 3.844e8, ['Planet', 'Moon']]
      : [SOLAR_MASS, SOLAR_MASS * factor, ASTRONOMICAL_UNIT, ['Star A', 'Star B']]
  const mu = G * (m1 + m2)
  const s = elementsToState(a, e, 0, 0, mu) // starts at periapsis on the +x axis
  return {
    bodies: [
      { name: names[0], mass: m1, x: 0, y: 0, vx: 0, vy: 0 },
      { name: names[1], mass: m2, ...s },
    ],
    a,
    period: keplerPeriod(a, mu),
    extent: 1.15 * a * (1 + e),
  }
}

function createInstance(values: ParameterValues): SimulationInstance {
  const s = setup(values)
  const scenario = values.scenario as Scenario
  const model = new NBodyModel({
    bodies: s.bodies,
    interaction: 'gravity',
    softening: num(values, 'softening') * (Number.isNaN(s.a) ? ASTRONOMICAL_UNIT : s.a),
    integrator: choice(values, 'integrator', ['velocity-verlet', 'rk4'] as const),
    centreOfMassFrame: true,
  })
  const relativeAngle = () => {
    const [x0, y0] = model.position(0)
    const [x1, y1] = model.position(1)
    return Math.atan2(y1 - y0, x1 - x0)
  }
  const tracker = new OrbitTracker(relativeAngle())
  const e0 = model.kineticEnergy() + model.potentialEnergy()
  const l0 = model.angularMomentum()
  const trails = new Trails(model.n, Array(model.n).fill(s.period / 500), 600)
  const separation = () => {
    const [x0, y0] = model.position(0)
    const [x1, y1] = model.position(1)
    return Math.hypot(x1 - x0, y1 - y0)
  }
  const colors = ['position', 'momentum', 'energy'] as const
  const massMax = Math.max(...model.bodies.map((b) => b.mass))

  return {
    get time() {
      return model.time
    },
    finished: false,
    step(dt) {
      model.step(dt)
      tracker.update(model.time, relativeAngle())
      trails.record(model.time, (i) => model.position(i))
    },
    sample() {
      const e = model.kineticEnergy() + model.potentialEnergy()
      return [separation() / 1e3, model.kineticEnergy(), model.potentialEnergy(), e, ((e - e0) / Math.abs(e0)) * 1e6, model.angularMomentum()]
    },
    readouts() {
      const e = model.kineticEnergy() + model.potentialEnergy()
      const r = separation()
      const [px, py] = model.momentum()
      const twoBody = scenario !== 'figure-eight'
      const orbit: ReadoutItem[] = twoBody
        ? [
            { label: 'Separation r', value: r / 1e3, unit: 'km' },
            { label: 'Gravitational force Gm₁m₂/r²', value: (G * model.bodies[0].mass * model.bodies[1].mass) / r ** 2, unit: 'N' },
            { label: 'Period (measured)', value: tracker.period / DAY, unit: 'days', description: 'Time for the relative position vector to turn through 360°' },
            { label: 'Period (Kepler III)', value: s.period / DAY, unit: 'days', description: '2π√(a³ / G(m₁+m₂))' },
            { label: 'Orbits completed', value: tracker.orbits, unit: '', sigFigs: 1 },
          ]
        : [
            { label: 'Known period of the figure-eight', value: s.period / DAY, unit: 'days', description: '6.3259 in units G = m = 1, scaled to 1 M☉ and 1 AU' },
            { label: 'Distance A–B', value: r / ASTRONOMICAL_UNIT, unit: 'AU' },
          ]
      return [
        { title: twoBody ? 'Orbit' : 'Three-body figure-eight', items: orbit },
        {
          title: 'Conservation (numerical check)',
          items: [
            { label: 'Total energy', value: e, unit: 'J' },
            { label: 'Energy change since start', value: ((e - e0) / Math.abs(e0)) * 1e6, unit: 'ppm', description: 'The true energy is constant: this is integrator error.' },
            { label: 'Angular momentum change', value: l0 !== 0 ? (model.angularMomentum() / l0 - 1) * 1e6 : Number.NaN, unit: 'ppm' },
            {
              label: 'Net momentum / Σ m|v|',
              value: Math.hypot(px, py) / model.bodies.reduce((sum, _b, i) => sum + model.bodies[i].mass * Math.hypot(...model.velocity(i)), 0),
              unit: '',
              description: 'Zero in the centre-of-mass frame; anything left is floating-point round-off.',
            },
          ],
        },
      ]
    },
    notices() {
      const n: string[] = []
      if (num(values, 'softening') > 0) n.push('Softening is on: forces are weakened below the softening length. This prevents numerical blow-up at close approach but is not a property of nature.')
      if (scenario === 'figure-eight') n.push('The figure-eight orbit is unstable: tiny numerical errors grow until it breaks apart, typically after a few periods. That is real three-body chaos, not a bug.')
      if (values.integrator === 'rk4') n.push('RK4 is not symplectic: watch the energy drift steadily over many orbits, unlike velocity Verlet.')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const unit = scenario === 'planet-moon' ? 1e8 : ASTRONOMICAL_UNIT
      const unitLabel = scenario === 'planet-moon' ? '×10⁵ km' : 'AU'
      const vp = fitViewport({ xMin: -s.extent, xMax: s.extent, yMin: -s.extent, yMax: s.extent }, width, height)
      // Grid in display units: draw with a scaled viewport so labels read in AU or 10⁵ km.
      drawGrid(ctx, { ...vp, scale: vp.scale * unit, toX: (x) => vp.toX(x * unit), toY: (y) => vp.toY(y * unit), visible: { xMin: vp.visible.xMin / unit, xMax: vp.visible.xMax / unit, yMin: vp.visible.yMin / unit, yMax: vp.visible.yMax / unit } }, palette, unitLabel)
      const forces = model.forces()
      const fMax = Math.max(...Array.from({ length: model.n }, (_, i) => Math.hypot(forces[2 * i], forces[2 * i + 1])), 1e-30)
      for (let i = 0; i < model.n; i++) {
        const color = palette[colors[i % 3]]
        const pos = model.position(i)
        trails.draw(ctx, vp, i, color, pos)
        const fx = forces[2 * i]
        const fy = forces[2 * i + 1]
        const L = (0.25 * s.extent) / fMax
        drawArrow(ctx, vp.toX(pos[0]), vp.toY(pos[1]), vp.toX(pos[0] + fx * L), vp.toY(pos[1] + fy * L), palette.force, 'F')
        drawDisc(ctx, vp.toX(pos[0]), vp.toY(pos[1]), 4 + 7 * Math.cbrt(model.bodies[i].mass / massMax), color)
        drawLabel(ctx, model.bodies[i].name, vp.toX(pos[0]) + 10, vp.toY(pos[1]) - 8, palette.ink)
      }
      drawLabel(ctx, '+ centre of mass', vp.toX(0) - 4, vp.toY(0) + 4, palette.gridLabel)
    },
  }
}

export const gravitySimulation: SimulationDefinition = {
  id: 'gravity-n-body',
  dt: 60,
  timestep: (v) => setup(v).period / (v.scenario === 'figure-eight' ? 20_000 : 5000),
  clock: (v) => ({ unit: 'days', secondsPerUnit: DAY, unitsPerRealSecond: v.scenario === 'planet-moon' ? 2 : 20 }),
  canvasDescription: 'Bodies orbiting their common centre of mass, with their trails and gravitational force vectors.',
  parameters: [
    {
      kind: 'choice', key: 'scenario', label: 'System', defaultValue: 'planet-moon',
      options: [
        { value: 'planet-moon', label: 'Earth and Moon' },
        { value: 'binary', label: 'Binary star (1 M☉, 1 AU)' },
        { value: 'figure-eight', label: 'Three-body figure-eight' },
      ],
    },
    { kind: 'number', key: 'eccentricity', label: 'Eccentricity e', unit: '', min: 0, max: 0.95, step: 0.01, defaultValue: 0.3, visibleWhen: notFigureEight },
    { kind: 'number', key: 'massFactor', label: 'Mass of second body ×', unit: '', min: 0.1, max: 20, step: 0.1, defaultValue: 1, visibleWhen: notFigureEight, description: 'Multiplies the Moon’s or second star’s real mass.' },
    {
      kind: 'choice', key: 'integrator', label: 'Integrator', defaultValue: 'velocity-verlet',
      options: [
        { value: 'velocity-verlet', label: 'Velocity Verlet (symplectic)' },
        { value: 'rk4', label: 'Runge–Kutta 4' },
      ],
    },
    { kind: 'number', key: 'softening', label: 'Softening ε / a', unit: '', min: 0, max: 0.1, step: 0.005, defaultValue: 0, description: 'Weakens forces at close range. 0 = exact Newtonian gravity.' },
  ],
  equations: [
    { label: 'Newton’s law of gravitation', expression: 'F = G m₁ m₂ / r²' },
    { label: 'Kepler’s third law', expression: 'T² = 4π² a³ / (G (m₁ + m₂))' },
    { label: 'Energy', expression: 'E = Σ ½ m v² − Σ G mᵢ mⱼ / rᵢⱼ' },
    { label: 'Softened force', expression: 'F = G m₁ m₂ r / (r² + ε²)^{3/2}' },
  ],
  sampleInterval: (v) => setup(v).period / 400,
  channels: [
    { key: 'separation', label: 'Separation of bodies 1 and 2', unit: 'km' },
    { key: 'ke', label: 'Kinetic energy', unit: 'J' },
    { key: 'pe', label: 'Potential energy', unit: 'J' },
    { key: 'energy', label: 'Total energy', unit: 'J' },
    { key: 'drift', label: 'Energy change', unit: 'ppm' },
    { key: 'angularMomentum', label: 'Angular momentum', unit: 'kg·m²/s' },
  ],
  charts: [
    { id: 'separation', title: 'Separation', unit: 'km', series: [{ key: 'separation', color: 'position' }] },
    { id: 'energy', title: 'Energy', unit: 'J', series: [{ key: 'ke', color: 'velocity' }, { key: 'pe', color: 'position' }, { key: 'energy', color: 'energy' }] },
    { id: 'drift', title: 'Energy error', unit: 'ppm', series: [{ key: 'drift', color: 'energy' }] },
  ],
  create: createInstance,
}
