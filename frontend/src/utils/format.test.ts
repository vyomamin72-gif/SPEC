import { describe, expect, it } from 'vitest'
import { formatQuantity, formatScalar } from './format'

const NBSP = ' '
const MINUS = '−'

describe('formatScalar', () => {
  it('keeps significant trailing zeros', () => {
    expect(formatScalar(9.81)).toBe('9.810')
    expect(formatScalar(9.81, { sigFigs: 3 })).toBe('9.81')
  })

  it('rounds to the requested significant figures', () => {
    expect(formatScalar(3.14159265, { sigFigs: 5 })).toBe('3.1416')
    expect(formatScalar(1234)).toBe('1234')
  })

  it('uses a real minus sign', () => {
    expect(formatScalar(-2.5)).toBe(`${MINUS}2.500`)
  })

  it('never implies more precision than requested', () => {
    expect(formatScalar(123456, { sigFigs: 3 })).toBe(`1.23${NBSP}×${NBSP}10⁵`)
    expect(formatScalar(12346)).toBe(`1.235${NBSP}×${NBSP}10⁴`)
  })

  it('switches to scientific notation for very small and very large values', () => {
    expect(formatScalar(6.674e-11)).toBe(`6.674${NBSP}×${NBSP}10⁻¹¹`)
    expect(formatScalar(1.989e30, { sigFigs: 4 })).toBe(`1.989${NBSP}×${NBSP}10³⁰`)
    expect(formatScalar(0.001)).toBe('0.001000')
    expect(formatScalar(0.0009999, { sigFigs: 4 })).toBe(`9.999${NBSP}×${NBSP}10⁻⁴`)
  })

  it('decides notation after rounding', () => {
    expect(formatScalar(9999.9)).toBe(`1.000${NBSP}×${NBSP}10⁴`)
    expect(formatScalar(0.00099996)).toBe('0.001000')
  })

  it('shows zero and non-finite values honestly', () => {
    expect(formatScalar(0)).toBe('0.000')
    expect(formatScalar(Number.NaN)).toBe('—')
    expect(formatScalar(Infinity)).toBe('∞')
    expect(formatScalar(-Infinity)).toBe(`${MINUS}∞`)
  })

  it('clamps unreasonable significant-figure requests', () => {
    expect(formatScalar(2, { sigFigs: 0 })).toBe('2')
    expect(formatScalar(2, { sigFigs: 99 })).toBe('2.00000000000000')
  })
})

describe('formatQuantity', () => {
  it('joins value and unit with a non-breaking space', () => {
    expect(formatQuantity(9.81, 'm/s²')).toBe(`9.810${NBSP}m/s²`)
  })

  it('shows an undefined value without a unit', () => {
    expect(formatQuantity(Number.NaN, 's')).toBe('—')
    expect(formatQuantity(Infinity, 's')).toBe(`∞${NBSP}s`)
  })

  it('omits the separator for dimensionless quantities', () => {
    expect(formatQuantity(0.5, '')).toBe('0.5000')
  })
})
