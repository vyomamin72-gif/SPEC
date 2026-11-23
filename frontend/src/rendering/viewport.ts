/** World rectangle in metres (y up). */
export interface WorldBounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/** Maps world coordinates (m, y up) to canvas pixels (y down) with one uniform scale. */
export interface Viewport {
  /** Pixels per metre. */
  scale: number
  toX(x: number): number
  toY(y: number): number
  /** The world region actually visible (wider than requested along one axis). */
  visible: WorldBounds
}

/**
 * Fit `bounds` into a width × height canvas, preserving aspect ratio. Spare
 * space is split evenly, or with anchor 'bottom' it all goes above the scene
 * (keeps the ground at the bottom instead of floating mid-canvas).
 */
export function fitViewport(
  bounds: WorldBounds,
  width: number,
  height: number,
  padding = 24,
  anchor: 'center' | 'bottom' = 'center',
): Viewport {
  const worldW = Math.max(bounds.xMax - bounds.xMin, 1e-9)
  const worldH = Math.max(bounds.yMax - bounds.yMin, 1e-9)
  const scale = Math.max(Math.min((width - 2 * padding) / worldW, (height - 2 * padding) / worldH), 1e-9)
  const halfW = width / 2 / scale
  const halfH = height / 2 / scale
  const cx = (bounds.xMin + bounds.xMax) / 2
  const cy = anchor === 'bottom' ? bounds.yMin - padding / scale + halfH : (bounds.yMin + bounds.yMax) / 2
  return {
    scale,
    toX: (x) => width / 2 + (x - cx) * scale,
    toY: (y) => height / 2 - (y - cy) * scale,
    visible: { xMin: cx - halfW, xMax: cx + halfW, yMin: cy - halfH, yMax: cy + halfH },
  }
}

/** A "nice" grid spacing (1, 2 or 5 × 10ⁿ) giving roughly `targetLines` lines across `span`. */
export function niceStep(span: number, targetLines = 8): number {
  const raw = span / targetLines
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  return (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * power
}
