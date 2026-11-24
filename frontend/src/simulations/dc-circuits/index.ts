import { kirchhoffResiduals, solveCircuit } from '@/physics/models/circuit'
import type { Circuit, CircuitElement, Solution } from '@/physics/models/circuit'
import { clear, drawDisc, LABEL_FONT } from '@/rendering/draw'
import type { Palette } from '@/rendering/palette'
import { fitViewport } from '@/rendering/viewport'
import type { Viewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, ReadoutItem, SimulationDefinition, SimulationInstance } from '../types'

const TOPOLOGIES = ['series', 'parallel', 'series-parallel', 'wheatstone', 'two-sources', 'rc'] as const
type Topology = (typeof TOPOLOGIES)[number]
type Point = [number, number]

interface Layout {
  circuit: Circuit
  /** Drawing position of each element: from its node a end to its node b end. */
  place: Record<string, [Point, Point]>
  wires: Point[][]
  /** Equivalent-resistance formula seen by source V, if the topology has one. */
  equivalent?: (r: number[]) => { value: number; formula: string }
}

const has = (topologies: Topology[]) => (v: ParameterValues) => topologies.includes(v.topology as Topology)

function layout(t: Topology, v: ParameterValues): Layout {
  const R = [1, 2, 3, 4, 5].map((k) => num(v, `r${k}`))
  const V1 = num(v, 'v1')
  const res = (id: string, a: number, b: number, k: number): CircuitElement => ({ kind: 'resistor', id, a, b, resistance: R[k] })
  switch (t) {
    case 'series':
      return {
        circuit: { nodes: 4, elements: [{ kind: 'voltage', id: 'V', a: 1, b: 0, voltage: V1 }, res('R1', 1, 2, 0), res('R2', 2, 3, 1), res('R3', 3, 0, 2)] },
        place: { V: [[0, 3], [0, 0]], R1: [[1, 3], [3, 3]], R2: [[3, 3], [5, 3]], R3: [[6, 3], [6, 0]] },
        wires: [[[0, 3], [1, 3]], [[5, 3], [6, 3]], [[6, 0], [0, 0]]],
        equivalent: (r) => ({ value: r[0] + r[1] + r[2], formula: 'R₁ + R₂ + R₃' }),
      }
    case 'parallel':
      return {
        circuit: { nodes: 2, elements: [{ kind: 'voltage', id: 'V', a: 1, b: 0, voltage: V1 }, res('R1', 1, 0, 0), res('R2', 1, 0, 1), res('R3', 1, 0, 2)] },
        place: { V: [[0, 3], [0, 0]], R1: [[2, 3], [2, 0]], R2: [[4, 3], [4, 0]], R3: [[6, 3], [6, 0]] },
        wires: [[[0, 3], [6, 3]], [[0, 0], [6, 0]]],
        equivalent: (r) => ({ value: 1 / (1 / r[0] + 1 / r[1] + 1 / r[2]), formula: '1 / (1/R₁ + 1/R₂ + 1/R₃)' }),
      }
    case 'series-parallel':
      return {
        circuit: { nodes: 3, elements: [{ kind: 'voltage', id: 'V', a: 1, b: 0, voltage: V1 }, res('R1', 1, 2, 0), res('R2', 2, 0, 1), res('R3', 2, 0, 2)] },
        place: { V: [[0, 3], [0, 0]], R1: [[1, 3], [3, 3]], R2: [[4, 3], [4, 0]], R3: [[6, 3], [6, 0]] },
        wires: [[[0, 3], [1, 3]], [[3, 3], [6, 3]], [[0, 0], [6, 0]]],
        equivalent: (r) => ({ value: r[0] + 1 / (1 / r[1] + 1 / r[2]), formula: 'R₁ + R₂R₃/(R₂ + R₃)' }),
      }
    case 'wheatstone':
      return {
        circuit: {
          nodes: 4,
          elements: [{ kind: 'voltage', id: 'V', a: 1, b: 0, voltage: V1 }, res('R1', 1, 2, 0), res('R2', 2, 0, 1), res('R3', 1, 3, 2), res('R4', 3, 0, 3), res('G', 2, 3, 4)],
        },
        place: { V: [[0, 4], [0, 0]], R1: [[2, 4], [2, 2]], R2: [[2, 2], [2, 0]], R3: [[5, 4], [5, 2]], R4: [[5, 2], [5, 0]], G: [[2, 2], [5, 2]] },
        wires: [[[0, 4], [5, 4]], [[0, 0], [5, 0]]],
      }
    case 'two-sources':
      return {
        circuit: {
          nodes: 4,
          elements: [{ kind: 'voltage', id: 'V', a: 1, b: 0, voltage: V1 }, { kind: 'voltage', id: 'V2', a: 3, b: 0, voltage: num(v, 'v2') }, res('R1', 1, 2, 0), res('R2', 2, 3, 1), res('R3', 2, 0, 2)],
        },
        place: { V: [[0, 3], [0, 0]], V2: [[6, 3], [6, 0]], R1: [[1, 3], [3, 3]], R2: [[3, 3], [5, 3]], R3: [[3, 3], [3, 0]] },
        wires: [[[0, 3], [1, 3]], [[5, 3], [6, 3]], [[0, 0], [6, 0]]],
      }
    case 'rc':
      return {
        circuit: {
          nodes: 3,
          elements: [{ kind: 'voltage', id: 'V', a: 1, b: 0, voltage: V1 }, { kind: 'resistor', id: 'R', a: 1, b: 2, resistance: num(v, 'rcResistance') * 1e3 }, { kind: 'capacitor', id: 'C', a: 2, b: 0, capacitance: num(v, 'capacitance') * 1e-6 }],
        },
        place: { V: [[0, 3], [0, 0]], R: [[1, 3], [4, 3]], C: [[6, 3], [6, 0]] },
        wires: [[[0, 3], [1, 3]], [[4, 3], [6, 3]], [[0, 0], [6, 0]]],
      }
  }
}

function drawElement(ctx: CanvasRenderingContext2D, vp: Viewport, e: CircuitElement, [p, q]: [Point, Point], palette: Palette) {
  const [x0, y0] = [vp.toX(p[0]), vp.toY(p[1])]
  const [x1, y1] = [vp.toX(q[0]), vp.toY(q[1])]
  const len = Math.hypot(x1 - x0, y1 - y0)
  const [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len]
  const [nx, ny] = [-uy, ux]
  const body = Math.min(46, 0.6 * len)
  const s0 = (len - body) / 2
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x0 + ux * s0, y0 + uy * s0)
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - ux * s0, y1 - uy * s0)
  ctx.stroke()
  const at = (s: number, n: number): [number, number] => [x0 + ux * s + nx * n, y0 + uy * s + ny * n]
  ctx.beginPath()
  if (e.kind === 'resistor') {
    ctx.moveTo(...at(s0, 0))
    for (let i = 1; i <= 6; i++) ctx.lineTo(...at(s0 + (body * (i - 0.5)) / 6, i % 2 ? 7 : -7))
    ctx.lineTo(...at(s0 + body, 0))
  } else if (e.kind === 'voltage') {
    // Long plate (+) at the a end, short plate (−) at the b end.
    ctx.moveTo(...at(s0 + body / 2 - 4, -14))
    ctx.lineTo(...at(s0 + body / 2 - 4, 14))
    ctx.moveTo(...at(s0 + body / 2 + 4, -7))
    ctx.lineTo(...at(s0 + body / 2 + 4, 7))
    ctx.moveTo(...at(s0, 0))
    ctx.lineTo(...at(s0 + body / 2 - 4, 0))
    ctx.moveTo(...at(s0 + body / 2 + 4, 0))
    ctx.lineTo(...at(s0 + body, 0))
  } else {
    ctx.moveTo(...at(s0 + body / 2 - 4, -12))
    ctx.lineTo(...at(s0 + body / 2 - 4, 12))
    ctx.moveTo(...at(s0 + body / 2 + 4, -12))
    ctx.lineTo(...at(s0 + body / 2 + 4, 12))
    ctx.moveTo(...at(s0, 0))
    ctx.lineTo(...at(s0 + body / 2 - 4, 0))
    ctx.moveTo(...at(s0 + body / 2 + 4, 0))
    ctx.lineTo(...at(s0 + body, 0))
  }
  ctx.stroke()
}

function format(value: number, unit: string): string {
  const abs = Math.abs(value)
  if (abs !== 0 && abs < 1) return `${(value * 1000).toPrecision(3)} m${unit}`
  return `${value.toPrecision(3)} ${unit}`
}

function createInstance(values: ParameterValues): SimulationInstance {
  const topology = choice(values, 'topology', TOPOLOGIES)
  const L = layout(topology, values)
  const isRc = topology === 'rc'
  const R = [1, 2, 3, 4, 5].map((k) => num(values, `r${k}`))
  let time = 0
  let mode = choice(values, 'switch', ['charge', 'discharge'] as const)
  let switchTime = 0
  let switchVoltage = 0
  const capacitorVoltages = new Map([['C', 0]])
  const V1 = num(values, 'v1')
  const rcR = num(values, 'rcResistance') * 1e3
  const rcC = num(values, 'capacitance') * 1e-6
  const tau = rcR * rcC
  let dt = tau / 200
  const circuitNow = (): Circuit =>
    isRc && mode === 'discharge'
      ? { ...L.circuit, elements: L.circuit.elements.map((e) => (e.kind === 'voltage' ? { ...e, voltage: 0 } : e)) }
      : L.circuit
  let solution: Solution = isRc ? solveCircuit(circuitNow(), { dt, capacitorVoltages }) : solveCircuit(L.circuit)
  const theoryVc = () => (mode === 'charge' ? V1 + (switchVoltage - V1) * Math.exp(-(time - switchTime) / tau) : switchVoltage * Math.exp(-(time - switchTime) / tau))

  return {
    get time() {
      return time
    },
    finished: false,
    isStatic: !isRc,
    step(h) {
      if (!isRc) return
      dt = h
      solution = solveCircuit(circuitNow(), { dt: h, capacitorVoltages })
      capacitorVoltages.set('C', solution.voltages[2])
      time += h
    },
    update(next) {
      const wanted = choice(next, 'switch', ['charge', 'discharge'] as const)
      if (wanted !== mode) {
        mode = wanted
        switchTime = time
        switchVoltage = capacitorVoltages.get('C') ?? 0
      }
    },
    sample() {
      if (!isRc) return [Number.NaN, Number.NaN, Number.NaN]
      return [solution.voltages[2], theoryVc(), (solution.currents.get('R') ?? 0) * 1000]
    },
    readouts() {
      const items: ReadoutItem[] = []
      for (const e of L.circuit.elements) {
        const i = solution.currents.get(e.id) ?? 0
        if (e.kind === 'voltage') {
          items.push({ label: `${e.id === 'V' ? 'Source V₁' : 'Source V₂'} current`, value: i * 1000, unit: 'mA' })
          continue
        }
        const v = solution.voltages[e.a] - solution.voltages[e.b]
        items.push({ label: `${e.id}: current`, value: i * 1000, unit: 'mA' }, { label: `${e.id}: voltage`, value: v, unit: 'V' })
        if (e.kind === 'resistor') items.push({ label: `${e.id}: power`, value: v * i * 1000, unit: 'mW' })
      }
      const supplied = L.circuit.elements.filter((e) => e.kind === 'voltage').reduce((s, e) => s + (e.kind === 'voltage' ? e.voltage * (solution.currents.get(e.id) ?? 0) : 0), 0)
      const dissipated = L.circuit.elements.filter((e) => e.kind === 'resistor').reduce((s, e) => s + (solution.voltages[e.a] - solution.voltages[e.b]) * (solution.currents.get(e.id) ?? 0), 0)
      const checks: ReadoutItem[] = [
        { label: 'Power supplied by sources', value: supplied * 1000, unit: 'mW' },
        { label: 'Power dissipated in resistors', value: dissipated * 1000, unit: 'mW' },
        { label: 'Largest Kirchhoff current error', value: Math.max(...kirchhoffResiduals(L.circuit, solution).map(Math.abs)), unit: 'A', description: 'Net current into each node; zero up to round-off' },
      ]
      if (L.equivalent) {
        const eq = L.equivalent(R)
        checks.unshift({ label: 'R_eq = V / I (measured)', value: V1 / (solution.currents.get('V') ?? Number.NaN), unit: 'Ω' }, { label: `R_eq = ${eq.formula}`, value: eq.value, unit: 'Ω' })
      }
      if (topology === 'wheatstone') checks.unshift({ label: 'Balance: R₁/R₂ vs R₃/R₄', text: `${(R[0] / R[1]).toPrecision(4)} vs ${(R[2] / R[3]).toPrecision(4)}`, unit: '' })
      if (isRc) {
        checks.unshift(
          { label: 'Time constant τ = RC', value: tau, unit: 's' },
          { label: 'Capacitor voltage (simulated)', value: solution.voltages[2], unit: 'V' },
          { label: 'Capacitor voltage (exact)', value: theoryVc(), unit: 'V', description: mode === 'charge' ? 'V − (V − V₀) e^{−t/τ}' : 'V₀ e^{−t/τ}' },
        )
      }
      return [
        { title: 'Checks', items: checks },
        { title: 'Components', items },
      ]
    },
    notices() {
      const n = ['Ideal components: wires have no resistance and sources no internal resistance. Solved by modified nodal analysis.']
      if (topology === 'wheatstone') n.push('Make R₁/R₂ equal R₃/R₄ and the galvanometer current G drops to zero: the bridge is balanced.')
      if (isRc) n.push('Backward Euler with Δt = τ/200: first-order accurate, so the simulated voltage differs from the exact curve by a small, shrinking amount (about 0.2 % of V at most).')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport({ xMin: -1, xMax: 7.2, yMin: -0.8, yMax: 4.8 }, width, height)
      ctx.strokeStyle = palette.ink
      ctx.lineWidth = 1.8
      for (const w of L.wires) {
        ctx.beginPath()
        w.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(vp.toX(x), vp.toY(y)) : ctx.lineTo(vp.toX(x), vp.toY(y))))
        ctx.stroke()
      }
      ctx.font = LABEL_FONT
      for (const e of L.circuit.elements) {
        const place = L.place[e.id]
        drawElement(ctx, vp, e, place, palette)
        const [p, q] = place
        const mx = vp.toX((p[0] + q[0]) / 2)
        const my = vp.toY((p[1] + q[1]) / 2)
        const vertical = p[0] === q[0]
        const i = solution.currents.get(e.id) ?? 0
        const label =
          e.kind === 'voltage'
            ? `${e.id === 'V' ? 'V₁' : 'V₂'} = ${e.voltage} V`
            : e.kind === 'resistor'
              ? `${e.id} = ${e.resistance >= 1000 ? `${e.resistance / 1000} kΩ` : `${e.resistance} Ω`}`
              : `C = ${(e.capacitance * 1e6).toPrecision(3)} µF`
        ctx.fillStyle = palette.ink
        ctx.fillText(label, vertical ? mx + 14 : mx - 28, vertical ? my - 4 : my - 16)
        ctx.fillStyle = palette.velocity
        ctx.fillText(`I = ${format(Math.abs(i), 'A')}`, vertical ? mx + 14 : mx - 28, vertical ? my + 12 : my + 24)
      }
      for (let node = 0; node < L.circuit.nodes; node++) {
        // Mark each node once, at the first element terminal that touches it.
        const e = L.circuit.elements.find((el) => el.a === node || el.b === node)
        if (!e) continue
        const point = L.place[e.id][e.a === node ? 0 : 1]
        drawDisc(ctx, vp.toX(point[0]), vp.toY(point[1]), 3.5, palette.energy)
        ctx.fillStyle = palette.energy
        ctx.fillText(`${solution.voltages[node].toPrecision(3)} V`, vp.toX(point[0]) - 18, vp.toY(point[1]) - 8)
      }
    },
  }
}

export const dcCircuitsSimulation: SimulationDefinition = {
  id: 'dc-circuits',
  dt: 1e-3,
  timestep: (v) => (num(v, 'rcResistance') * 1e3 * num(v, 'capacitance') * 1e-6) / 200,
  canvasDescription: 'A circuit diagram labelled with each component’s value, the current through it, and node voltages.',
  parameters: [
    {
      kind: 'choice', key: 'topology', label: 'Circuit', defaultValue: 'series',
      options: [
        { value: 'series', label: 'Three resistors in series' },
        { value: 'parallel', label: 'Three resistors in parallel' },
        { value: 'series-parallel', label: 'R₁ in series with R₂ ∥ R₃' },
        { value: 'wheatstone', label: 'Wheatstone bridge' },
        { value: 'two-sources', label: 'Two sources (Kirchhoff’s laws)' },
        { value: 'rc', label: 'RC circuit (charging)' },
      ],
    },
    { kind: 'number', key: 'v1', label: 'Source voltage V₁', unit: 'V', min: 0, max: 24, step: 0.5, defaultValue: 12 },
    { kind: 'number', key: 'v2', label: 'Source voltage V₂', unit: 'V', min: 0, max: 24, step: 0.5, defaultValue: 6, visibleWhen: has(['two-sources']) },
    { kind: 'number', key: 'r1', label: 'R₁', unit: 'Ω', min: 1, max: 1000, step: 1, defaultValue: 100, visibleWhen: has(['series', 'parallel', 'series-parallel', 'wheatstone', 'two-sources']) },
    { kind: 'number', key: 'r2', label: 'R₂', unit: 'Ω', min: 1, max: 1000, step: 1, defaultValue: 200, visibleWhen: has(['series', 'parallel', 'series-parallel', 'wheatstone', 'two-sources']) },
    { kind: 'number', key: 'r3', label: 'R₃', unit: 'Ω', min: 1, max: 1000, step: 1, defaultValue: 300, visibleWhen: has(['series', 'parallel', 'series-parallel', 'wheatstone', 'two-sources']) },
    { kind: 'number', key: 'r4', label: 'R₄', unit: 'Ω', min: 1, max: 1000, step: 1, defaultValue: 600, visibleWhen: has(['wheatstone']) },
    { kind: 'number', key: 'r5', label: 'Galvanometer resistance', unit: 'Ω', min: 1, max: 1000, step: 1, defaultValue: 50, visibleWhen: has(['wheatstone']) },
    { kind: 'number', key: 'rcResistance', label: 'Resistance R', unit: 'kΩ', min: 0.1, max: 100, step: 0.1, defaultValue: 10, visibleWhen: has(['rc']) },
    { kind: 'number', key: 'capacitance', label: 'Capacitance C', unit: 'µF', min: 1, max: 1000, step: 1, defaultValue: 100, visibleWhen: has(['rc']) },
    { kind: 'choice', key: 'switch', label: 'Switch', defaultValue: 'charge', live: true, visibleWhen: has(['rc']), options: [{ value: 'charge', label: 'Connected to the source (charge)' }, { value: 'discharge', label: 'Source replaced by a wire (discharge)' }] },
  ],
  equations: [
    { label: 'Ohm’s law', expression: 'V = I R' },
    { label: 'Series / parallel', expression: 'R = ΣRᵢ  /  1/R = Σ 1/Rᵢ' },
    { label: 'Kirchhoff’s laws', expression: 'Σ I_in = Σ I_out;  Σ ΔV around a loop = 0' },
    { label: 'Power', expression: 'P = V I = I² R' },
    { label: 'RC charging', expression: 'V_C(t) = V (1 − e^{−t/RC})' },
  ],
  sampleInterval: (v) => (num(v, 'rcResistance') * 1e3 * num(v, 'capacitance') * 1e-6) / 100,
  channels: [
    { key: 'vc', label: 'Capacitor voltage', unit: 'V' },
    { key: 'vcExact', label: 'Capacitor voltage, exact', unit: 'V' },
    { key: 'current', label: 'Current through R', unit: 'mA' },
  ],
  charts: [
    { id: 'voltage', title: 'Capacitor voltage', unit: 'V', series: [{ key: 'vc', color: 'position' }, { key: 'vcExact', color: 'theory', theory: true }] },
    { id: 'current', title: 'Current', unit: 'mA', series: [{ key: 'current', color: 'velocity' }] },
  ],
  create: createInstance,
}
