import { WaveString } from '@/physics/models/waveString'
import { clear, drawDisc, drawLabel, LABEL_FONT } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'

const L = 2
const CELLS = 400
const COURANT = 0.95
const AIR_DENSITY = 1.204 // kg/m³ at 20 °C
const REFERENCE_PRESSURE = 20e-6 // Pa, threshold of hearing

function createInstance(values: ParameterValues): SimulationInstance {
  const c = num(values, 'soundSpeed')
  const s0 = num(values, 'amplitude') * 1e-6
  const end = choice(values, 'farEnd', ['absorbing', 'closed', 'open'] as const)
  const s = new WaveString({
    length: L,
    cells: CELLS,
    waveSpeed: c,
    courant: COURANT,
    damping: 0,
    left: 'driven',
    right: end === 'absorbing' ? 'open' : end === 'closed' ? 'fixed' : 'free',
    driveAmplitude: s0,
    driveFrequency: num(values, 'frequency'),
    driveRampTime: 3 / num(values, 'frequency'),
  })
  const rampTime = 3 / num(values, 'frequency')
  const probe = Math.round(CELLS / 2)
  /** Acoustic pressure p = −ρc² ∂s/∂x at node i (central difference). */
  const pressure = (i: number) => {
    const a = s.u[Math.max(i - 1, 0)]
    const b = s.u[Math.min(i + 1, s.n - 1)]
    const span = (Math.min(i + 1, s.n - 1) - Math.max(i - 1, 0)) * s.dx
    return (-AIR_DENSITY * c * c * (b - a)) / span
  }

  const measuredWavelength = () => {
    // Only meaningful once the steady wave has filled the tube.
    if (s.time < L / c + rampTime + 2 / s.currentDriveFrequency) return Number.NaN
    // Distance between successive same-direction zero crossings of the pressure, near the source.
    const xs: number[] = []
    for (let i = 2; i < s.n - 2 && xs.length < 4; i++) {
      const p1 = pressure(i - 1)
      const p2 = pressure(i)
      if (p1 > 0 && p2 <= 0) xs.push(s.x[i - 1] + (s.dx * p1) / (p1 - p2))
    }
    return xs.length >= 2 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : Number.NaN
  }

  return {
    get time() {
      return s.time
    },
    finished: false,
    step: () => s.step(),
    update(next) {
      s.setDriveFrequency(num(next, 'frequency'))
    },
    sample() {
      return [s.u[probe] * 1e6, pressure(probe)]
    },
    readouts() {
      const f = s.currentDriveFrequency
      const pTheory = AIR_DENSITY * c * 2 * Math.PI * f * s0
      let pMax = 0
      for (let i = 1; i < s.n - 1; i++) pMax = Math.max(pMax, Math.abs(pressure(i)))
      return [
        {
          title: 'Sound wave',
          items: [
            { label: 'Frequency f', value: f, unit: 'Hz' },
            { label: 'Wavelength λ = c/f', value: c / f, unit: 'm' },
            { label: 'Wavelength (measured from pressure)', value: measuredWavelength(), unit: 'm', description: 'Spacing of pressure zero crossings, once the wave fills the tube' },
            { label: 'Period', value: 1000 / f, unit: 'ms' },
          ],
        },
        {
          title: 'Pressure',
          items: [
            { label: 'Pressure amplitude ρcωs₀ (travelling wave)', value: pTheory, unit: 'Pa' },
            { label: 'Largest pressure in the tube now', value: pMax, unit: 'Pa' },
            { label: 'Sound pressure level', value: 20 * Math.log10(pTheory / Math.SQRT2 / REFERENCE_PRESSURE), unit: 'dB', sigFigs: 3 },
          ],
        },
      ]
    },
    notices() {
      const n = ['The piston starts gently over three cycles: an abrupt start makes a kink the grid cannot resolve, which would ring.', 'Air parcels move back and forth along the tube (longitudinal wave); their displacement is exaggerated enormously so it can be seen.']
      if (end === 'closed') n.push('Closed far end: the air cannot move there (displacement node, pressure antinode), so reflections build standing waves.')
      if (end === 'open') n.push('Open far end: the pressure stays atmospheric there (pressure node), so the wave reflects with inverted pressure.')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport({ xMin: -0.05, xMax: L + 0.05, yMin: -0.75, yMax: 0.55 }, width, height)
      const exaggeration = 0.012 / Math.max(s0, 1e-12)
      // Tube walls
      ctx.strokeStyle = palette.line
      ctx.lineWidth = 2
      for (const y of [0.45, 0.05]) {
        ctx.beginPath()
        ctx.moveTo(vp.toX(0), vp.toY(y))
        ctx.lineTo(vp.toX(L), vp.toY(y))
        ctx.stroke()
      }
      // Air parcels: columns of dots displaced by s(x, t)
      for (let i = 0; i < s.n; i += 4) {
        const x = s.x[i] + s.u[i] * exaggeration
        for (let row = 0; row < 6; row++) drawDisc(ctx, vp.toX(x), vp.toY(0.1 + row * 0.06), 1.6, palette.position)
      }
      // Piston
      ctx.fillStyle = palette.muted
      ctx.fillRect(vp.toX(s.u[0] * exaggeration) - 6, vp.toY(0.45), 6, 0.4 * vp.scale)
      // Pressure profile
      let pMax = 1e-12
      for (let i = 1; i < s.n - 1; i++) pMax = Math.max(pMax, Math.abs(pressure(i)))
      const pScale = 0.25 / pMax
      ctx.strokeStyle = palette.grid
      ctx.beginPath()
      ctx.moveTo(vp.toX(0), vp.toY(-0.4))
      ctx.lineTo(vp.toX(L), vp.toY(-0.4))
      ctx.stroke()
      ctx.strokeStyle = palette.force
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 1; i < s.n - 1; i++) {
        const px = vp.toX(s.x[i])
        const py = vp.toY(-0.4 + pressure(i) * pScale)
        if (i === 1) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.font = LABEL_FONT
      drawLabel(ctx, 'air parcels (displacement exaggerated)', vp.toX(0), vp.toY(0.45) - 6, palette.gridLabel)
      drawLabel(ctx, `pressure p = −ρc² ∂s/∂x (peak ${pMax.toFixed(2)} Pa)`, vp.toX(0), vp.toY(-0.1), palette.force)
      drawLabel(ctx, `${L} m tube`, vp.toX(L) - 50, vp.toY(-0.7), palette.gridLabel)
    },
  }
}

export const soundWavesSimulation: SimulationDefinition = {
  id: 'sound-waves',
  dt: 1e-5,
  timestep: (v) => (COURANT * (L / CELLS)) / num(v, 'soundSpeed'),
  clock: () => ({ unit: 'ms', secondsPerUnit: 1e-3, unitsPerRealSecond: 1 }),
  canvasDescription: 'Air parcels in a tube pushed back and forth by a piston, with the acoustic pressure plotted along the tube.',
  parameters: [
    { kind: 'number', key: 'frequency', label: 'Frequency f', unit: 'Hz', min: 100, max: 2000, step: 10, defaultValue: 500, live: true },
    { kind: 'number', key: 'amplitude', label: 'Piston amplitude s₀', unit: 'µm', min: 0.1, max: 50, step: 0.1, defaultValue: 10 },
    { kind: 'number', key: 'soundSpeed', label: 'Speed of sound c', unit: 'm/s', min: 300, max: 360, step: 1, defaultValue: 343, description: '343 m/s in dry air at 20 °C.' },
    { kind: 'choice', key: 'farEnd', label: 'Far end of the tube', defaultValue: 'absorbing', options: [{ value: 'absorbing', label: 'Absorbing (very long tube)' }, { value: 'closed', label: 'Closed' }, { value: 'open', label: 'Open' }] },
  ],
  equations: [
    { label: 'Wave equation (displacement s)', expression: '∂²s/∂t² = c² ∂²s/∂x²' },
    { label: 'Acoustic pressure', expression: 'p = −ρ c² ∂s/∂x' },
    { label: 'Travelling wave', expression: 'p₀ = ρ c ω s₀,  λ = c / f' },
    { label: 'Sound pressure level', expression: 'L_p = 20 log₁₀(p_rms / 20 µPa)' },
  ],
  sampleInterval: () => 2e-5,
  channels: [
    { key: 'displacement', label: 'Displacement at x = 1 m', unit: 'µm' },
    { key: 'pressure', label: 'Pressure at x = 1 m', unit: 'Pa' },
  ],
  charts: [
    { id: 'pressure', title: 'Pressure', unit: 'Pa', series: [{ key: 'pressure', color: 'force' }] },
    { id: 'displacement', title: 'Displacement', unit: 'µm', series: [{ key: 'displacement', color: 'position' }] },
  ],
  create: createInstance,
}
