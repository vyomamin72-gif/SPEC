import { expect, it } from 'vitest'
import { toCsv } from './csv'

it('writes a header, one row per sample, and empty cells for non-finite values', () => {
  const csv = toCsv([
    { header: 't (s)', values: [0, 0.01] },
    { header: 'x (m)', values: [1.5, Number.NaN] },
  ])
  expect(csv).toBe('t (s),x (m)\n0,1.5\n0.01,\n')
})

it('escapes headers containing commas or quotes', () => {
  expect(toCsv([{ header: 'a, "b"', values: [] }])).toBe('"a, ""b"""\n')
})

it('round-trips doubles exactly', () => {
  const values = [Math.PI, 1 / 3, 6.6743e-11, -1.98847e30, 0.1 + 0.2]
  const parsed = toCsv([{ header: 'v', values }]).trim().split('\n').slice(1).map(Number)
  expect(parsed).toEqual(values)
})
