import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'

export interface ParameterControlProps {
  label: string
  /** SI unit symbol, or '' for dimensionless. */
  unit: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  description?: string
  disabled?: boolean
}

/** Clamp to [min, max]; returns null for input that is not a finite number. */
export function parseParameterInput(text: string, min: number, max: number): number | null {
  const normalised = text.trim().replace('−', '-').replace(',', '.')
  if (normalised === '') return null
  const parsed = Number(normalised)
  if (!Number.isFinite(parsed)) return null
  return Math.min(max, Math.max(min, parsed))
}

/**
 * Text shown in the editable field: plain decimal/exponent notation that
 * Number() can parse back, limited to 6 significant figures to hide
 * floating-point noise from slider steps (e.g. 0.30000000000000004).
 */
export function toEditableText(value: number): string {
  return String(Number(value.toPrecision(6)))
}

/**
 * Slider plus exact numeric entry for one physical parameter.
 *
 * The slider gives quick exploration; the text field allows exact values
 * (e.g. a 45° launch). Typed values are committed on Enter or blur, clamped to
 * the allowed range, and invalid text is rejected rather than coerced to 0.
 */
export function ParameterControl({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  description,
  disabled = false,
}: ParameterControlProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)

  function commitDraft() {
    if (draft === null) return
    const parsed = parseParameterInput(draft, min, max)
    if (parsed !== null && parsed !== value) onChange(parsed)
    setDraft(null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') commitDraft()
    if (event.key === 'Escape') setDraft(null)
  }

  return (
    <div className="space-y-1.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-number`} className="text-ink">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id={`${id}-number`}
            type="text"
            inputMode="decimal"
            disabled={disabled}
            aria-describedby={description ? `${id}-desc` : undefined}
            value={draft ?? toEditableText(value)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={handleKeyDown}
            className="numeric h-7 w-24 rounded border border-line-strong bg-base px-2 text-right text-ink focus:border-accent focus:outline-none disabled:opacity-40"
          />
          <span className="w-10 text-xs text-muted">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-accent disabled:opacity-40"
      />
      {description && (
        <p id={`${id}-desc`} className="text-xs text-faint">
          {description}
        </p>
      )}
    </div>
  )
}
