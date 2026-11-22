import { formatQuantity } from '@/utils/format'

export interface ReadoutProps {
  label: string
  value: number
  unit: string
  sigFigs?: number
  /** Optional explanation, e.g. how the value was measured. */
  description?: string
}

/** A single labelled numeric measurement. */
export function Readout({ label, value, unit, sigFigs = 4, description }: ReadoutProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1" title={description}>
      <dt className="text-muted">{label}</dt>
      <dd className="numeric text-ink">{formatQuantity(value, unit, { sigFigs })}</dd>
    </div>
  )
}
