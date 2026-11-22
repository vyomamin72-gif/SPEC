/**
 * Number formatting for scientific readouts.
 *
 * Rules:
 * - A fixed number of significant figures (trailing zeros are kept, because
 *   they communicate precision: 9.810 is not the same claim as 9.81).
 * - Scientific notation when fixed notation would overstate precision
 *   (e.g. 123 456 at 3 s.f. is shown as 1.23 × 10⁵, never "123000"),
 *   or when the magnitude is below 10⁻³.
 * - The true minus sign (U+2212), not a hyphen.
 * - Non-finite values are shown honestly instead of as misleading numbers.
 */

const MINUS = '−'
const NBSP = ' '
const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
}

export interface FormatOptions {
  /** Significant figures, 1–15. Default 4. */
  sigFigs?: number
}

function toSuperscript(exponent: number): string {
  return String(exponent)
    .split('')
    .map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch)
    .join('')
}

export function formatScalar(value: number, options: FormatOptions = {}): string {
  const sigFigs = Math.min(15, Math.max(1, Math.round(options.sigFigs ?? 4)))

  if (Number.isNaN(value)) return '—'
  if (value === Infinity) return '∞'
  if (value === -Infinity) return `${MINUS}∞`
  if (value === 0) return sigFigs > 1 ? `0.${'0'.repeat(sigFigs - 1)}` : '0'

  const sign = value < 0 ? MINUS : ''
  const magnitude = Math.abs(value)

  // Decide notation from the exponent *after* rounding, so that 9999.9 at
  // 4 s.f. becomes 1.000 × 10⁴ rather than "10000".
  const [mantissaText, exponentText] = magnitude.toExponential(sigFigs - 1).split('e')
  const exponent = Number(exponentText)

  if (exponent < -3 || exponent >= sigFigs) {
    return `${sign}${mantissaText}${NBSP}×${NBSP}10${toSuperscript(exponent)}`
  }
  // In this exponent range toPrecision always yields fixed notation.
  return sign + magnitude.toPrecision(sigFigs)
}

/** Format a value with its unit, e.g. "9.810 m/s²". An empty unit means dimensionless. */
export function formatQuantity(value: number, unit: string, options: FormatOptions = {}): string {
  const text = formatScalar(value, options)
  // A unit after "—" would suggest a measured value exists.
  return unit && !Number.isNaN(value) ? `${text}${NBSP}${unit}` : text
}
