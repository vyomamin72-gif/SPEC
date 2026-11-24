import { RingBuffer } from '@/data/RingBuffer'
import type { Viewport } from '@/rendering/viewport'

/** Bounded position history per body, sampled at a per-body simulated-time interval. */
export class Trails {
  private readonly xs: RingBuffer[]
  private readonly ys: RingBuffer[]
  private readonly next: number[]
  private readonly intervals: number[]

  constructor(count: number, intervals: number[], capacity = 800) {
    this.intervals = intervals
    this.xs = Array.from({ length: count }, () => new RingBuffer(capacity))
    this.ys = Array.from({ length: count }, () => new RingBuffer(capacity))
    this.next = Array.from({ length: count }, () => 0)
  }

  record(time: number, positions: (i: number) => [number, number]): void {
    for (let i = 0; i < this.xs.length; i++) {
      if (time < this.next[i]) continue
      const [x, y] = positions(i)
      this.xs[i].push(x)
      this.ys[i].push(y)
      this.next[i] = time + this.intervals[i]
    }
  }

  draw(ctx: CanvasRenderingContext2D, vp: Viewport, i: number, color: string, current: [number, number]): void {
    const xs = this.xs[i]
    const ys = this.ys[i]
    if (xs.length === 0) return
    ctx.save()
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let k = 0; k < xs.length; k++) {
      if (k === 0) ctx.moveTo(vp.toX(xs.at(k)), vp.toY(ys.at(k)))
      else ctx.lineTo(vp.toX(xs.at(k)), vp.toY(ys.at(k)))
    }
    ctx.lineTo(vp.toX(current[0]), vp.toY(current[1]))
    ctx.stroke()
    ctx.restore()
  }
}
