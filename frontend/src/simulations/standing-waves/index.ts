import { gridModeFrequency, modeFrequency, WaveString } from '@/physics/models/waveString'
import { clear, drawDisc, drawGrid, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'
import { drawStringProfile } from '../shared/drawing'

const L = 2
const CELLS = 200
const COURANT = 0.9
const isPluck = (v: ParameterValues) => v.mode === 'pluck'
const isDrive = (v: ParameterValues) => v.mode === 'drive'

function createInstance(values: ParameterValues): SimulationInstance {
  const mode = choice(values, 'mode', ['pluck', 'drive'] as const)
  const n = num(values, 'harmonic')
  const c = num(values, 'waveSpeed')
  const amplitude = mode === 'pluck' ? 0.05 : 0.002
  const s = new WaveString({
    length: L,
    cells: CELLS,
    waveSpeed: c,
    courant: COURANT,
    damping: mode === 'drive' ? num(values, 'damping') : 0,
    left: mode === 'drive' ? 'driven' : 'fixed',
    right: 'fixed',
    driveAmplitude: amplitude,
    driveFrequency: num(values, 'driveFrequency'),
    initial: mode === 'pluck' ? (x) => amplitude * Math.sin((n * Math.PI * x) / L) : undefined,
  })
  const probe = mode === 'pluck' ? Math.round(CELLS / (2 * n)) : Math.round(CELLS / 2)
  const crossings: number[] = []
  let last = s.u[probe]
  let envelope = 0
  let envelopeDecayStart = 0

  return {
    get time() {
      return s.time
    },
    finished: false,
    step() {
      s.step()
      const now = s.u[probe]
      if (last > 0 && now <= 0) crossings.push(s.time - s.dt * (now / (now - last)))
      last = now
      // Largest displacement on the string over roughly the last second.
      const peak = Math.max(...Array.from(s.u, Math.abs))
      if (s.time - envelopeDecayStart > 1) {
        envelope = peak
        envelopeDecayStart = s.time
      } else envelope = Math.max(envelope, peak)
    },
    update(next) {
      s.setDriveFrequency(num(next, 'driveFrequency'))
    },
    sample() {
      return [s.u[probe], s.u[0]]
    },
    readouts() {
      const measured = crossings.length >= 2 ? (crossings.length - 1) / (crossings[crossings.length - 1] - crossings[0]) : Number.NaN
      if (mode === 'pluck') {
        return [
          {
            title: `Harmonic n = ${n}`,
            items: [
              { label: 'Frequency (measured)', value: measured, unit: 'Hz', description: 'From zero crossings at an antinode' },
              { label: 'Frequency fₙ = n c / 2L', value: modeFrequency(n, c, L), unit: 'Hz' },
              { label: 'Frequency on this grid', value: gridModeFrequency(n, s), unit: 'Hz', description: 'Including numerical dispersion: sin(ωΔt/2) = C sin(kΔx/2)' },
              { label: 'Wavelength λₙ = 2L/n', value: (2 * L) / n, unit: 'm' },
              { label: 'Nodes (including ends)', value: n + 1, unit: '', sigFigs: 1 },
            ],
          },
        ]
      }
      const f = s.currentDriveFrequency
      const nearest = Math.max(1, Math.round((2 * L * f) / c))
      return [
        {
          title: 'Driven string',
          items: [
            { label: 'Driving frequency', value: f, unit: 'Hz' },
            { label: 'Nearest resonance fₙ', value: modeFrequency(nearest, c, L), unit: 'Hz' },
            { label: 'n of that resonance', value: nearest, unit: '', sigFigs: 1 },
            { label: 'Largest displacement (last second)', value: envelope * 1000, unit: 'mm' },
            { label: 'Driving amplitude', value: amplitude * 1000, unit: 'mm' },
          ],
        },
      ]
    },
    notices() {
      return mode === 'drive'
        ? [`Resonances of this string are at fₙ = n·${(c / (2 * L)).toFixed(2)} Hz. Tune the driving frequency onto one and the standing wave grows far beyond the driving amplitude.`]
        : ['The measured frequency matches the grid prediction to high precision; it sits slightly below n c/2L because the finite-difference grid disperses waves (C = 0.9).']
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport({ xMin: -0.1, xMax: L + 0.1, yMin: -0.9, yMax: 0.9 }, width, height)
      drawGrid(ctx, vp, palette)
      const scale = mode === 'pluck' ? 10 : 0.5 / Math.max(envelope, amplitude)
      drawStringProfile(ctx, vp, s, palette, scale)
      if (mode === 'pluck') for (let k = 0; k <= n; k++) drawDisc(ctx, vp.toX((k * L) / n), vp.toY(0), 3, palette.force)
      drawLabel(ctx, mode === 'pluck' ? 'vertical scale ×10 · dots: nodes' : 'vertical scale adjusts to the amplitude', 8, 18, palette.gridLabel)
    },
  }
}

export const standingWavesSimulation: SimulationDefinition = {
  id: 'standing-waves',
  dt: 1e-3,
  timestep: (v) => (COURANT * (L / CELLS)) / num(v, 'waveSpeed'),
  canvasDescription: 'A string fixed at both ends vibrating in a standing-wave pattern, with its nodes marked.',
  parameters: [
    { kind: 'choice', key: 'mode', label: 'Excitation', defaultValue: 'pluck', options: [{ value: 'pluck', label: 'Start in a normal mode' }, { value: 'drive', label: 'Drive one end' }] },
    { kind: 'number', key: 'harmonic', label: 'Harmonic n', unit: '', min: 1, max: 8, step: 1, defaultValue: 2, visibleWhen: isPluck },
    { kind: 'number', key: 'waveSpeed', label: 'Wave speed c', unit: 'm/s', min: 2, max: 40, step: 0.5, defaultValue: 20 },
    { kind: 'number', key: 'driveFrequency', label: 'Driving frequency', unit: 'Hz', min: 0.5, max: 40, step: 0.05, defaultValue: 4.5, live: true, visibleWhen: isDrive },
    { kind: 'number', key: 'damping', label: 'Damping γ', unit: '1/s', min: 0.05, max: 3, step: 0.05, defaultValue: 0.3, visibleWhen: isDrive },
  ],
  equations: [
    { label: 'Normal modes', expression: 'u(x, t) = A sin(nπx/L) cos(2π fₙ t)' },
    { label: 'Mode frequencies', expression: 'fₙ = n c / (2L)' },
    { label: 'Wavelengths', expression: 'λₙ = 2L / n' },
    { label: 'Grid dispersion', expression: 'sin(ωΔt/2) = C sin(kΔx/2)' },
  ],
  sampleInterval: () => 0.002,
  channels: [
    { key: 'probe', label: 'Displacement at the probe', unit: 'm' },
    { key: 'end', label: 'Displacement of the left end', unit: 'm' },
  ],
  charts: [{ id: 'probe', title: 'Displacement', unit: 'm', series: [{ key: 'probe', color: 'position' }, { key: 'end', color: 'force' }] }],
  create: createInstance,
}
