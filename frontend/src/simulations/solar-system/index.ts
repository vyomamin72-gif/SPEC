import { keplerPeriod } from '@/physics/analysis/kepler'
import { OrbitTracker } from '@/physics/analysis/orbitTracker'
import { GRAVITATIONAL_CONSTANT as G, NBodyModel } from '@/physics/models/nbody'
import { ASTRONOMICAL_UNIT as AU, DAY, PLANETS, SOLAR_MASS, solarSystemBodies } from '@/physics/models/solarSystem'
import { clear, drawDisc, drawGrid, drawLabel } from '@/rendering/draw'
import type { Viewport } from '@/rendering/viewport'
import { fitViewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'
import { Trails } from '../shared/trails'

const NAMES = PLANETS.map((p) => p.name)
const INNER = ['Mercury', 'Venus', 'Earth', 'Mars']
const DISTANCE_CHANNELS = INNER.map((n) => n.toLowerCase())

function auViewport(vp: Viewport): Viewport {
  return {
    scale: vp.scale * AU,
    toX: (x) => vp.toX(x * AU),
    toY: (y) => vp.toY(y * AU),
    visible: { xMin: vp.visible.xMin / AU, xMax: vp.visible.xMax / AU, yMin: vp.visible.yMin / AU, yMax: vp.visible.yMax / AU },
  }
}

function createInstance(values: ParameterValues): SimulationInstance {
  let selected = choice(values, 'planet', NAMES)
  let view = choice(values, 'view', ['inner', 'outer'] as const)
  const jupiterFactor = num(values, 'jupiterMass')
  const speedFactor = num(values, 'speedFactor')
  const model = new NBodyModel({
    bodies: solarSystemBodies({ massFactor: { Jupiter: jupiterFactor }, speedFactor: { [selected]: speedFactor } }),
    interaction: 'gravity',
    softening: 0,
    integrator: 'velocity-verlet',
    centreOfMassFrame: true,
  })
  const helio = (i: number): [number, number] => {
    const [sx, sy] = model.position(0)
    const [x, y] = model.position(i)
    return [x - sx, y - sy]
  }
  const angle = (i: number) => {
    const [x, y] = helio(i)
    return Math.atan2(y, x)
  }
  const trackers = PLANETS.map((_, k) => new OrbitTracker(angle(k + 1)))
  const e0 = model.kineticEnergy() + model.potentialEnergy()
  const trails = new Trails(model.n, [1e30, ...PLANETS.map((p) => (p.siderealPeriodDays * DAY) / 360)], 400)
  const index = (name: string) => NAMES.indexOf(name) + 1

  return {
    get time() {
      return model.time
    },
    finished: false,
    step(dt) {
      model.step(dt)
      trackers.forEach((t, k) => t.update(model.time, angle(k + 1)))
      trails.record(model.time, (i) => model.position(i))
    },
    update(next) {
      selected = choice(next, 'planet', NAMES)
      view = choice(next, 'view', ['inner', 'outer'] as const)
    },
    sample() {
      const e = model.kineticEnergy() + model.potentialEnergy()
      return [...INNER.map((n) => Math.hypot(...helio(index(n))) / AU), ((e - e0) / Math.abs(e0)) * 1e9]
    },
    readouts() {
      const i = index(selected)
      const data = PLANETS[i - 1]
      const [x, y] = helio(i)
      const [vx, vy] = model.velocity(i)
      const [svx, svy] = model.velocity(0)
      const e = model.kineticEnergy() + model.potentialEnergy()
      return [
        {
          title: selected,
          items: [
            { label: 'Distance from the Sun', value: Math.hypot(x, y) / AU, unit: 'AU' },
            { label: 'Orbital speed', value: Math.hypot(vx - svx, vy - svy) / 1e3, unit: 'km/s' },
            { label: 'Mass', value: model.bodies[i].mass, unit: 'kg' },
            { label: 'Period (measured)', value: trackers[i - 1].period / DAY, unit: 'days', description: 'From completed revolutions around the Sun in this simulation' },
            { label: 'Period (Kepler III)', value: keplerPeriod(data.a * AU, G * (SOLAR_MASS + model.bodies[i].mass)) / DAY, unit: 'days', description: 'From the J2000 semi-major axis' },
            { label: 'Period (observed sidereal)', value: data.siderealPeriodDays, unit: 'days' },
            { label: 'Orbits completed', value: trackers[i - 1].orbits, unit: '', sigFigs: 1 },
          ],
        },
        {
          title: 'Numerical check',
          items: [{ label: 'Total energy change', value: ((e - e0) / Math.abs(e0)) * 1e9, unit: 'ppb', description: 'Energy of an isolated system is constant: this is integrator error.' }],
        },
      ]
    },
    notices() {
      const n = [
        'Positions start from J2000 mean orbital elements, projected onto the ecliptic plane (inclinations ignored). Newtonian gravity only: no relativity, moons or asteroids, so the motion slowly drifts from the real ephemeris.',
      ]
      if (jupiterFactor !== 1) n.push(`Jupiter’s mass is ×${jupiterFactor}: watch how the other orbits are perturbed.`)
      if (speedFactor !== 1) n.push(`${selected} was launched at ${Math.round(speedFactor * 100)}% of its real speed.`)
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const extent = (view === 'inner' ? 1.8 : 32) * AU
      const vp = fitViewport({ xMin: -extent, xMax: extent, yMin: -extent, yMax: extent }, width, height)
      drawGrid(ctx, auViewport(vp), palette, 'AU')
      drawDisc(ctx, vp.toX(model.position(0)[0]), vp.toY(model.position(0)[1]), 7, palette.energy)
      for (let i = 1; i < model.n; i++) {
        const name = model.bodies[i].name
        const highlight = name === selected
        const pos = model.position(i)
        trails.draw(ctx, vp, i, highlight ? palette.position : palette.line, pos)
        drawDisc(ctx, vp.toX(pos[0]), vp.toY(pos[1]), highlight ? 5 : 3.5, highlight ? palette.position : palette.ink)
        if (view === 'outer' || INNER.includes(name)) drawLabel(ctx, name, vp.toX(pos[0]) + 7, vp.toY(pos[1]) - 6, highlight ? palette.ink : palette.muted)
      }
      drawLabel(ctx, 'Sun', vp.toX(model.position(0)[0]) + 9, vp.toY(model.position(0)[1]) + 4, palette.muted)
    },
  }
}

export const solarSystemSimulation: SimulationDefinition = {
  id: 'solar-system',
  dt: 0.1 * DAY,
  clock: () => ({ unit: 'days', secondsPerUnit: DAY, unitsPerRealSecond: 20 }),
  canvasDescription: 'Top view of the Sun and the eight planets with their orbital trails, distances in astronomical units.',
  parameters: [
    { kind: 'choice', key: 'view', label: 'View', defaultValue: 'inner', live: true, options: [{ value: 'inner', label: 'Inner planets (±1.8 AU)' }, { value: 'outer', label: 'Whole system (±32 AU)' }] },
    { kind: 'choice', key: 'planet', label: 'Planet details', defaultValue: 'Earth', live: true, options: NAMES.map((n) => ({ value: n, label: n })) },
    { kind: 'number', key: 'jupiterMass', label: 'Jupiter mass ×', unit: '', min: 0, max: 1000, step: 1, defaultValue: 1, description: 'Changes the initial conditions; restarts the run.' },
    { kind: 'number', key: 'speedFactor', label: 'Selected planet’s start speed ×', unit: '', min: 0.5, max: 1.45, step: 0.01, defaultValue: 1, description: 'Below 1 the orbit becomes more eccentric; near √2 ≈ 1.41 the planet escapes.' },
  ],
  equations: [
    { label: 'Gravitation (every pair)', expression: 'Fᵢⱼ = G mᵢ mⱼ / rᵢⱼ²' },
    { label: 'Kepler’s third law', expression: 'T² = 4π² a³ / (G (M☉ + m))' },
    { label: 'Integrator', expression: 'velocity Verlet, Δt = 0.1 day' },
  ],
  sampleInterval: () => 2 * DAY,
  channels: [
    ...INNER.map((n, i) => ({ key: DISTANCE_CHANNELS[i], label: `${n} distance from the Sun`, unit: 'AU' })),
    { key: 'drift', label: 'Total energy change', unit: 'ppb' },
  ],
  charts: [
    {
      id: 'distances', title: 'Distance from the Sun', unit: 'AU',
      series: [{ key: 'mercury', color: 'acceleration' }, { key: 'venus', color: 'energy' }, { key: 'earth', color: 'position' }, { key: 'mars', color: 'momentum' }],
    },
    { id: 'drift', title: 'Energy error', unit: 'ppb', series: [{ key: 'drift', color: 'energy' }] },
  ],
  create: createInstance,
}
