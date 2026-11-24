import type { Palette } from './palette'
import type { Viewport } from './viewport'
import { niceStep } from './viewport'

export const LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif'

export function clear(ctx: CanvasRenderingContext2D, width: number, height: number, palette: Palette): void {
  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, width, height)
}

/** Metre grid with labelled lines, so distances on screen can be read directly. */
export function drawGrid(ctx: CanvasRenderingContext2D, vp: Viewport, palette: Palette, unit = 'm'): void {
  const { xMin, xMax, yMin, yMax } = vp.visible
  const step = niceStep(Math.max(xMax - xMin, yMax - yMin))
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  ctx.save()
  ctx.strokeStyle = palette.grid
  ctx.fillStyle = palette.gridLabel
  ctx.lineWidth = 1
  ctx.font = LABEL_FONT
  ctx.globalAlpha = 0.6
  for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) {
    const px = Math.round(vp.toX(x)) + 0.5
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, vp.toY(yMin))
    ctx.stroke()
    ctx.fillText(`${x.toFixed(decimals)}`, px + 3, vp.toY(yMin) - 4)
  }
  for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) {
    const py = Math.round(vp.toY(y)) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, py)
    ctx.lineTo(vp.toX(xMax), py)
    ctx.stroke()
    ctx.fillText(`${y.toFixed(decimals)} ${unit}`, 4, py - 3)
  }
  ctx.restore()
}

/** Arrow from (x0, y0) to (x1, y1) in pixels, with an optional label at the tip. */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  label?: string,
): void {
  const length = Math.hypot(x1 - x0, y1 - y0)
  if (length < 2) return
  const head = Math.min(10, length * 0.4)
  const angle = Math.atan2(y1 - y0, x1 - x0)
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1 - head * 0.6 * Math.cos(angle), y1 - head * 0.6 * Math.sin(angle))
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - head * Math.cos(angle - 0.4), y1 - head * Math.sin(angle - 0.4))
  ctx.lineTo(x1 - head * Math.cos(angle + 0.4), y1 - head * Math.sin(angle + 0.4))
  ctx.closePath()
  ctx.fill()
  if (label) {
    ctx.font = LABEL_FONT
    ctx.fillText(label, x1 + 6 * Math.cos(angle) + 3, y1 + 6 * Math.sin(angle) + 4)
  }
  ctx.restore()
}

export function drawDisc(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string, stroke?: string): void {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.save()
  ctx.font = LABEL_FONT
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}
