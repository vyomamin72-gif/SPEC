import { drawArrow } from '@/rendering/draw'
import type { Viewport } from '@/rendering/viewport'

type Field = (x: number, y: number) => [number, number]

/**
 * Grid of unit-length arrows showing field direction; opacity encodes
 * strength on a logarithmic scale (field strength spans many decades).
 */
export function drawVectorGrid(ctx: CanvasRenderingContext2D, vp: Viewport, field: Field, spacingPx: number, color: string): void {
  const { xMin, xMax, yMin, yMax } = vp.visible
  const step = spacingPx / vp.scale
  const samples: [number, number, number, number, number][] = []
  for (let x = xMin + step / 2; x < xMax; x += step) {
    for (let y = yMin + step / 2; y < yMax; y += step) {
      const [fx, fy] = field(x, y)
      const m = Math.hypot(fx, fy)
      if (Number.isFinite(m) && m > 0) samples.push([x, y, fx / m, fy / m, Math.log10(m)])
    }
  }
  if (samples.length === 0) return
  const logs = samples.map((s) => s[4]).sort((a, b) => a - b)
  const lo = logs[Math.floor(0.05 * (logs.length - 1))]
  const hi = logs[Math.floor(0.95 * (logs.length - 1))]
  ctx.save()
  for (const [x, y, ux, uy, l] of samples) {
    ctx.globalAlpha = 0.25 + 0.75 * Math.min(1, Math.max(0, (l - lo) / Math.max(hi - lo, 1e-9)))
    const len = 0.42 * spacingPx
    const cx = vp.toX(x)
    const cy = vp.toY(y)
    drawArrow(ctx, cx - (ux * len) / 2, cy + (uy * len) / 2, cx + (ux * len) / 2, cy - (uy * len) / 2, color)
  }
  ctx.restore()
}

export function drawPolylines(ctx: CanvasRenderingContext2D, vp: Viewport, lines: [number, number][][], color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.8
  ctx.lineWidth = 1.3
  for (const line of lines) {
    ctx.beginPath()
    line.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(vp.toX(x), vp.toY(y)) : ctx.lineTo(vp.toX(x), vp.toY(y))))
    ctx.stroke()
  }
  ctx.restore()
}
