import { expect, it } from 'vitest'
import { fitViewport, niceStep } from './viewport'

it('maps world to pixels with uniform scale and y pointing up', () => {
  const vp = fitViewport({ xMin: 0, xMax: 10, yMin: 0, yMax: 5 }, 220, 220, 10)
  expect(vp.scale).toBe(20)
  expect(vp.toX(5)).toBe(110)
  expect(vp.toY(2.5)).toBe(110)
  expect(vp.toY(5)).toBeLessThan(vp.toY(0))
})

it('anchors the scene to the bottom edge when asked', () => {
  const vp = fitViewport({ xMin: 0, xMax: 10, yMin: 0, yMax: 1 }, 220, 220, 10, 'bottom')
  expect(vp.toY(0)).toBeCloseTo(210, 12) // ground sits on the bottom padding
})

it('picks 1-2-5 grid steps', () => {
  expect(niceStep(40)).toBe(5)
  expect(niceStep(7)).toBe(1)
  expect(niceStep(0.3)).toBeCloseTo(0.05, 12)
})
