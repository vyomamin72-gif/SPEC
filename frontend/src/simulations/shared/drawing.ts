import type { WaveString } from '@/physics/models/waveString'
import { drawLabel } from '@/rendering/draw'
import type { Palette } from '@/rendering/palette'
import type { Viewport } from '@/rendering/viewport'

/** Horizontal zig-zag spring from x0 to x1 (world metres) at height y. */
export function drawSpring(ctx: CanvasRenderingContext2D, vp: Viewport, x0: number, x1: number, y: number, palette: Palette, coils = 12): void {
  const amp = 0.06
  ctx.save()
  ctx.strokeStyle = palette.muted
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(vp.toX(x0), vp.toY(y))
  const lead = 0.05 * (x1 - x0)
  ctx.lineTo(vp.toX(x0 + lead), vp.toY(y))
  for (let i = 0; i <= 2 * coils; i++) {
    const x = x0 + lead + ((x1 - x0 - 2 * lead) * i) / (2 * coils)
    ctx.lineTo(vp.toX(x), vp.toY(y + (i === 0 || i === 2 * coils ? 0 : i % 2 ? amp : -amp)))
  }
  ctx.lineTo(vp.toX(x1), vp.toY(y))
  ctx.stroke()
  ctx.restore()
}

/** The string's displacement profile, vertically exaggerated by `yScale`, with its boundary markers. */
export function drawStringProfile(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  s: WaveString,
  palette: Palette,
  yScale: number,
  color = palette.position,
): void {
  ctx.save()
  ctx.strokeStyle = palette.grid
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(vp.toX(0), vp.toY(0))
  ctx.lineTo(vp.toX(s.params.length), vp.toY(0))
  ctx.stroke()
  ctx.restore()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i < s.n; i++) {
    const px = vp.toX(s.x[i])
    const py = vp.toY(s.u[i] * yScale)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  const label = (b: string) => ({ fixed: 'fixed end', free: 'free end', open: 'open (absorbing)', driven: 'driven end' })[b] ?? b
  drawLabel(ctx, label(s.params.left), vp.toX(0) + 4, vp.toY(0) + 18, palette.gridLabel)
  drawLabel(ctx, label(s.params.right), vp.toX(s.params.length) - 90, vp.toY(0) + 18, palette.gridLabel)
}
