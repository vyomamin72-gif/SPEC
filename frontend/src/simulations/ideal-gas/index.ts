import { ARGON_DIAMETER, ARGON_MASS, BOLTZMANN, GasModel, hendersonCompressibility, idealPressure2D, maxwellBoltzmann2D, packingFraction } from '@/physics/models/gas'
import { clear, drawDisc, drawLabel, LABEL_FONT } from '@/rendering/draw'
import { num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'

const T_MAX = 2000
/** Timestep: fast tail particles (~3× rms at T_MAX) move under 0.25 diameters per step. */
const DT = (0.08 * ARGON_DIAMETER) / Math.sqrt((2 * BOLTZMANN * T_MAX) / ARGON_MASS)
const PS = 1e-12

function createInstance(values: ParameterValues): SimulationInstance {
  const count = Math.round(num(values, 'count'))
  const box = num(values, 'boxSize') * 1e-9
  let target = num(values, 'temperature')
  const gas = new GasModel({ count, boxSize: box, mass: ARGON_MASS, diameter: ARGON_DIAMETER, temperature: target, seed: 11 }, 20 * PS)
  const area = box * box
  const eta = packingFraction(count, ARGON_DIAMETER, area)
  let pressureSum = 0
  let pressureWindows = 0
  let lastPressure = Number.NaN
  let averageSince = 0

  return {
    get time() {
      return gas.time
    },
    finished: false,
    step(dt) {
      gas.step(dt)
      if (Number.isFinite(gas.pressure) && gas.pressure !== lastPressure) {
        lastPressure = gas.pressure
        // Skip the first 100 ps after a start or temperature change (thermalisation).
        if (gas.time - averageSince > 100 * PS) {
          pressureSum += gas.pressure
          pressureWindows++
        }
      }
    },
    update(next) {
      const t = num(next, 'temperature')
      if (t !== target) {
        target = t
        gas.setTemperature(t)
        pressureSum = 0
        pressureWindows = 0
        averageSince = gas.time
      }
    },
    sample() {
      const T = gas.temperature()
      return [T, (pressureWindows ? pressureSum / pressureWindows : Number.NaN) * 1e3, idealPressure2D(count, T, area) * 1e3, gas.pressure * 1e3]
    },
    readouts() {
      const T = gas.temperature()
      const speeds = gas.speeds()
      const mean = speeds.reduce((s, v) => s + v, 0) / speeds.length
      const pAvg = pressureWindows ? pressureSum / pressureWindows : Number.NaN
      const pIdeal = idealPressure2D(count, T, area)
      return [
        {
          title: 'Gas state',
          items: [
            { label: 'Temperature (from kinetic energy)', value: T, unit: 'K' },
            { label: 'Particles N', value: count, unit: '', sigFigs: 3 },
            { label: 'Area A', value: area * 1e18, unit: 'nm²' },
            { label: 'Area fraction η', value: eta * 100, unit: '%' },
          ],
        },
        {
          title: 'Pressure (2D: force per unit wall length)',
          items: [
            { label: 'Measured (wall impulses, averaged)', value: pAvg * 1e3, unit: 'mN/m', description: `Mean of ${pressureWindows} windows of 20 ps` },
            { label: 'Ideal gas NkT/A', value: pIdeal * 1e3, unit: 'mN/m' },
            { label: 'Hard disks (Henderson)', value: pIdeal * hendersonCompressibility(eta) * 1e3, unit: 'mN/m' },
            { label: 'Compressibility PA/(NkT), measured', value: pAvg / pIdeal, unit: '' },
            { label: 'Compressibility, Henderson', value: hendersonCompressibility(eta), unit: '' },
          ],
        },
        {
          title: 'Speeds',
          items: [
            { label: 'Mean speed (measured)', value: mean, unit: 'm/s' },
            { label: 'Mean speed √(πkT/2m)', value: Math.sqrt((Math.PI * BOLTZMANN * T) / (2 * ARGON_MASS)), unit: 'm/s' },
            { label: 'Collisions per particle', value: (2 * gas.collisions) / count, unit: '', sigFigs: 3 },
          ],
        },
      ]
    },
    notices() {
      return [
        'A real Newtonian simulation, but of a two-dimensional gas of argon-sized hard disks: its ideal-gas law is P·A = NkT, and it deviates at higher density because the disks take up area.',
        'Every particle starts at the same speed. Collisions spread the speeds into the Maxwell–Boltzmann distribution (right) within a few collision times.',
        'Changing the temperature rescales all velocities at once: an idealised thermostat.',
      ]
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const pad = 16
      const size = Math.min(height - 2 * pad, width * 0.58)
      const scale = size / box
      ctx.strokeStyle = palette.muted
      ctx.lineWidth = 2
      ctx.strokeRect(pad, pad, size, size)
      const vRms = Math.sqrt((2 * BOLTZMANN * Math.max(gas.temperature(), 1)) / ARGON_MASS)
      for (let i = 0; i < gas.n; i++) {
        const fast = Math.hypot(gas.vx[i], gas.vy[i]) > vRms
        drawDisc(ctx, pad + gas.x[i] * scale, pad + size - gas.y[i] * scale, Math.max(1.5, (ARGON_DIAMETER / 2) * scale), fast ? palette.momentum : palette.position)
      }
      drawLabel(ctx, `${(box * 1e9).toFixed(0)} nm box · orange: faster than v_rms`, pad, height - 2, palette.gridLabel)
      // Speed histogram vs Maxwell–Boltzmann
      const left = pad + size + 50
      const right = width - 16
      const top = pad + 20
      const bottom = height - 40
      if (right - left < 80) return
      const T = gas.temperature()
      const vMax = 3.2 * Math.sqrt((BOLTZMANN * T) / ARGON_MASS) * 1.6
      const bins = 24
      const counts = new Array<number>(bins).fill(0)
      for (const v of gas.speeds()) counts[Math.min(bins - 1, Math.floor((v / vMax) * bins))]++
      const binWidth = vMax / bins
      const density = counts.map((c) => c / (gas.n * binWidth))
      const peak = Math.max(maxwellBoltzmann2D(Math.sqrt((BOLTZMANN * T) / ARGON_MASS), ARGON_MASS, T), ...density) * 1.1
      ctx.fillStyle = palette.position
      ctx.globalAlpha = 0.6
      density.forEach((d, k) => {
        const x0 = left + ((right - left) * k) / bins
        const h = ((bottom - top) * d) / peak
        ctx.fillRect(x0 + 1, bottom - h, (right - left) / bins - 2, h)
      })
      ctx.globalAlpha = 1
      ctx.strokeStyle = palette.theory
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      for (let k = 0; k <= 100; k++) {
        const v = (vMax * k) / 100
        const px = left + ((right - left) * k) / 100
        const py = bottom - ((bottom - top) * maxwellBoltzmann2D(v, ARGON_MASS, T)) / peak
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = palette.grid
      ctx.strokeRect(left, top, right - left, bottom - top)
      ctx.font = LABEL_FONT
      drawLabel(ctx, 'speed distribution', left, top - 6, palette.muted)
      drawLabel(ctx, '0', left - 4, bottom + 14, palette.gridLabel)
      drawLabel(ctx, `${vMax.toFixed(0)} m/s`, right - 50, bottom + 14, palette.gridLabel)
      drawLabel(ctx, 'bars: simulation · dashed: Maxwell–Boltzmann', left, bottom + 30, palette.gridLabel)
    },
  }
}

export const idealGasSimulation: SimulationDefinition = {
  id: 'ideal-gas',
  dt: DT,
  clock: () => ({ unit: 'ps', secondsPerUnit: PS, unitsPerRealSecond: 20 }),
  canvasDescription: 'Argon atoms bouncing in a square box beside a histogram of their speeds compared with the Maxwell–Boltzmann distribution.',
  parameters: [
    { kind: 'number', key: 'count', label: 'Particles N', unit: '', min: 20, max: 400, step: 10, defaultValue: 150 },
    { kind: 'number', key: 'temperature', label: 'Temperature T', unit: 'K', min: 20, max: T_MAX, step: 10, defaultValue: 300, live: true, description: 'Can be changed while running (rescales all speeds).' },
    { kind: 'number', key: 'boxSize', label: 'Box side', unit: 'nm', min: 8, max: 40, step: 1, defaultValue: 20, description: 'Smaller boxes mean higher density.' },
  ],
  equations: [
    { label: 'Ideal gas (2D)', expression: 'P A = N k T' },
    { label: 'Temperature (2D, 2 degrees of freedom)', expression: '⟨½ m v²⟩ = k T' },
    { label: 'Speed distribution (2D)', expression: 'f(v) = (m v / kT) e^{−m v² / 2kT}' },
    { label: 'Hard disks (Henderson)', expression: 'P A / (N k T) = (1 + η²/8) / (1 − η)²' },
    { label: 'Pressure from impulses', expression: 'P = Σ 2 m v⊥ / (perimeter · Δt)' },
  ],
  sampleInterval: () => 10 * PS,
  channels: [
    { key: 'temperature', label: 'Temperature', unit: 'K' },
    { key: 'pressure', label: 'Pressure, running average', unit: 'mN/m' },
    { key: 'ideal', label: 'Ideal-gas pressure NkT/A', unit: 'mN/m' },
    { key: 'window', label: 'Pressure, latest 20 ps window', unit: 'mN/m' },
  ],
  charts: [
    { id: 'pressure', title: 'Pressure', unit: 'mN/m', series: [{ key: 'window', color: 'muted' }, { key: 'pressure', color: 'force' }, { key: 'ideal', color: 'theory', theory: true }] },
    { id: 'temperature', title: 'Temperature', unit: 'K', series: [{ key: 'temperature', color: 'energy' }] },
  ],
  create: createInstance,
}
