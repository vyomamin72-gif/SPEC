import { useId } from 'react'

export interface ChoiceControlProps {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
  description?: string
}

export function ChoiceControl({ label, value, options, onChange, description }: ChoiceControlProps) {
  const id = useId()
  return (
    <div className="space-y-1.5 py-1.5">
      <label htmlFor={id} className="block text-ink">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="h-8 w-full rounded border border-line-strong bg-base px-2 text-ink focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {description && (
        <p id={`${id}-desc`} className="text-xs text-faint">
          {description}
        </p>
      )}
    </div>
  )
}
