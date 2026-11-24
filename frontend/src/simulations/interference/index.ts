import { displacement, intensity, screenMaxima } from '@/physics/models/interference'
import type { InterferenceParams } from '@/physics/models/interference'
import { clear, drawDisc, drawLabel } from '@/rendering/draw'
import { fitViewport } from '@/rendering/viewport'
import { bool, choice, num } from '../types'
import type { ParameterValues, SimulationDefinition, SimulationInstance } from '../types'

const WAVE_SPEED = 0.2 // m/s, like ripples in a ripple tank
const SCREEN = 0.5 // m
const HALF_HEIGHT = 0.3 // m
const RESOLUTION = 3 // canvas pixels per field sample

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h.slice(0, 6)
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function createInstance(values: ParameterValues): SimulationInstance {
  const p: InterferenceParams = {
    wavelength: num(values, 'wavelength') / 100,
    separation: num(values, 'separation') / 100,
    phaseDifference: (num(values, 'phase') * Math.PI) / 180,
    decay: bool(values, 'decay'),
    waveSpeed: WAVE_SPEED,
  }
  let view = choice(values, 'view', ['wave', 'intensity'] as const)
  let time = 0
  const maxima = screenMaxima(p, SCREEN, HALF_HEIGHT)
  const central = maxima.filter((y) => Math.abs(y) < 3 * ((p.wavelength * SCREEN) / p.separation) + 1e-9)
  const measuredSpacing = central.length >= 2 ? (central[central.length - 1] - central[0]) / (central.length - 1) : Number.NaN
  const firstMinimum = (p.wavelength * SCREEN) / (2 * p.separation)
  let image: ImageData | null = null
  const offscreen = typeof document !== 'undefined' ? document.createElement('canvas') : null

  return {
    get time() {
      return time
    },
    finished: false,
    step(dt) {
      time += dt
    },
    update(next) {
      view = choice(next, 'view', ['wave', 'intensity'] as const)
    },
    sample() {
      return [displacement(p, SCREEN, 0, time), displacement(p, SCREEN, firstMinimum, time)]
    },
    readouts() {
      return [
        {
          title: 'Waves',
          items: [
            { label: 'Wavelength λ', value: p.wavelength * 100, unit: 'cm' },
            { label: 'Frequency f = v/λ', value: WAVE_SPEED / p.wavelength, unit: 'Hz' },
            { label: 'Source separation d', value: p.separation * 100, unit: 'cm' },
            { label: 'Phase difference Δφ', value: (p.phaseDifference * 180) / Math.PI, unit: '°' },
          ],
        },
        {
          title: `Screen at D = ${SCREEN * 100} cm`,
          items: [
            { label: 'Fringe spacing λD/d (small-angle theory)', value: ((p.wavelength * SCREEN) / p.separation) * 100, unit: 'cm' },
            { label: 'Fringe spacing (exact superposition)', value: measuredSpacing * 100, unit: 'cm', description: 'Mean spacing of the intensity maxima within ±3 fringes of the axis' },
            { label: 'Bright fringes on the screen', value: maxima.length, unit: '', sigFigs: 1 },
          ],
        },
      ]
    },
    notices() {
      const n: string[] = []
      if (p.separation < p.wavelength) n.push('d < λ: the path difference never reaches a full wavelength, so there are no side fringes.')
      if ((p.wavelength * SCREEN) / p.separation > 0.1) n.push('Large fringe angles: λD/d is a small-angle approximation and differs visibly from the exact pattern here.')
      return n
    },
    render(ctx, width, height, palette) {
      clear(ctx, width, height, palette)
      const vp = fitViewport({ xMin: -0.02, xMax: SCREEN + 0.12, yMin: -HALF_HEIGHT, yMax: HALF_HEIGHT }, width, height, 12)
      const x0 = Math.max(0, Math.floor(vp.toX(0)))
      const x1 = Math.min(width, Math.ceil(vp.toX(SCREEN)))
      const y0 = Math.max(0, Math.floor(vp.toY(HALF_HEIGHT)))
      const y1 = Math.min(height, Math.ceil(vp.toY(-HALF_HEIGHT)))
      const cols = Math.max(1, Math.floor((x1 - x0) / RESOLUTION))
      const rows = Math.max(1, Math.floor((y1 - y0) / RESOLUTION))
      if (offscreen && cols > 0 && rows > 0) {
        if (!image || image.width !== cols || image.height !== rows) image = new ImageData(cols, rows)
        const [pr, pg, pb] = rgb(palette.position)
        const [nr, ng, nb] = rgb(palette.momentum)
        const [br, bg, bb] = rgb(palette.background)
        const norm = p.decay ? 2 / Math.sqrt(0.05) : 2
        for (let j = 0; j < rows; j++) {
          const y = HALF_HEIGHT - ((j + 0.5) / rows) * 2 * HALF_HEIGHT
          for (let i = 0; i < cols; i++) {
            const x = ((i + 0.5) / cols) * SCREEN
            let r: number, g: number, b: number
            if (view === 'wave') {
              const v = Math.max(-1, Math.min(1, displacement(p, x, y, time) / norm))
              const [cr, cg, cb] = v >= 0 ? [pr, pg, pb] : [nr, ng, nb]
              const a = Math.abs(v)
              r = br + (cr - br) * a
              g = bg + (cg - bg) * a
              b = bb + (cb - bb) * a
            } else {
              const a = Math.min(1, intensity(p, x, y) / (norm * norm * 0.5))
              r = br + (255 - br) * a
              g = bg + (255 - bg) * a
              b = bb + (255 - bb) * a
            }
            const k = 4 * (j * cols + i)
            image.data[k] = r
            image.data[k + 1] = g
            image.data[k + 2] = b
            image.data[k + 3] = 255
          }
        }
        offscreen.width = cols
        offscreen.height = rows
        offscreen.getContext('2d')?.putImageData(image, 0, 0)
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(offscreen, x0, y0, x1 - x0, y1 - y0)
      }
      // Screen and its intensity profile
      ctx.strokeStyle = palette.ink
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(vp.toX(SCREEN), vp.toY(HALF_HEIGHT))
      ctx.lineTo(vp.toX(SCREEN), vp.toY(-HALF_HEIGHT))
      ctx.stroke()
      const iMax = Math.max(...Array.from({ length: 200 }, (_, k) => intensity(p, SCREEN, -HALF_HEIGHT + (2 * HALF_HEIGHT * k) / 199)), 1e-12)
      ctx.strokeStyle = palette.energy
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let k = 0; k < 300; k++) {
        const y = -HALF_HEIGHT + (2 * HALF_HEIGHT * k) / 299
        const px = vp.toX(SCREEN) + 4 + (0.09 * vp.scale * intensity(p, SCREEN, y)) / iMax
        if (k === 0) ctx.moveTo(px, vp.toY(y))
        else ctx.lineTo(px, vp.toY(y))
      }
      ctx.stroke()
      for (const y of maxima) drawDisc(ctx, vp.toX(SCREEN), vp.toY(y), 2.5, palette.energy)
      for (const s of [1, -1]) drawDisc(ctx, vp.toX(0), vp.toY((s * p.separation) / 2), 4, palette.ink)
      drawLabel(ctx, 'sources', vp.toX(0) + 6, vp.toY(p.separation / 2) - 6, palette.ink)
      drawLabel(ctx, 'screen', vp.toX(SCREEN) - 44, vp.toY(HALF_HEIGHT) + 14, palette.ink)
      drawLabel(ctx, view === 'wave' ? 'displacement: blue +, orange −' : 'time-averaged intensity', 8, 18, palette.gridLabel)
    },
  }
}

export const interferenceSimulation: SimulationDefinition = {
  id: 'interference',
  dt: 0.002,
  clock: () => ({ unit: 's', secondsPerUnit: 1, unitsPerRealSecond: 0.25 }),
  canvasDescription: 'Ripples from two point sources overlapping, with the intensity pattern they produce on a screen.',
  parameters: [
    { kind: 'choice', key: 'view', label: 'Show', defaultValue: 'wave', live: true, options: [{ value: 'wave', label: 'Instantaneous waves' }, { value: 'intensity', label: 'Time-averaged intensity' }] },
    { kind: 'number', key: 'wavelength', label: 'Wavelength λ', unit: 'cm', min: 0.5, max: 6, step: 0.1, defaultValue: 2 },
    { kind: 'number', key: 'separation', label: 'Source separation d', unit: 'cm', min: 0.5, max: 30, step: 0.5, defaultValue: 8 },
    { kind: 'number', key: 'phase', label: 'Phase difference Δφ', unit: '°', min: 0, max: 360, step: 5, defaultValue: 0 },
    { kind: 'boolean', key: 'decay', label: 'Amplitude falls off with distance (1/√r)', defaultValue: true },
  ],
  equations: [
    { label: 'Superposition', expression: 'u = a₁ cos(k r₁ − ωt) + a₂ cos(k r₂ − ωt + Δφ)' },
    { label: 'Bright fringes', expression: 'r₁ − r₂ = mλ + (Δφ/2π)λ' },
    { label: 'Far-field spacing', expression: 'Δy ≈ λ D / d   (small angles, D ≫ d)' },
    { label: 'Intensity', expression: 'I ∝ a₁² + a₂² + 2a₁a₂ cos(k(r₁ − r₂) − Δφ)' },
  ],
  sampleInterval: () => 0.004,
  channels: [
    { key: 'centre', label: 'Displacement at the screen centre', unit: '' },
    { key: 'minimum', label: 'Displacement at the first predicted minimum', unit: '' },
  ],
  charts: [{ id: 'screen', title: 'Displacement at the screen', unit: 'arb. units', series: [{ key: 'centre', color: 'position' }, { key: 'minimum', color: 'momentum' }] }],
  create: createInstance,
}
