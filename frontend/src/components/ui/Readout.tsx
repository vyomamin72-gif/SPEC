import { formatQuantity } from '@/utils/format'

export interface ReadoutProps {
  label: string
  value?: number
  /** Non-numeric value shown verbatim instead of `value`. */
  text?: string
  unit: string
  sigFigs?: number
  /** Optional explanation, e.g. how the value was measured. */
  description?: string
}

/** A single labelled numeric measurement. */
export function Readout({ label, value = Number.NaN, text, unit, sigFigs = 4, description }: ReadoutProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1" title={description} data-testid={`readout-${label}`}>
      <dt className="text-muted">{label}</dt>
      <dd className="numeric shrink-0 text-right text-ink">{text ?? formatQuantity(value, unit, { sigFigs })}</dd>
    </div>
  )
}
