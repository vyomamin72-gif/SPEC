export interface ToggleControlProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
}

export function ToggleControl({ label, checked, onChange, description }: ToggleControlProps) {
  return (
    <div className="py-1.5">
      <label className="flex cursor-pointer items-center gap-2 text-ink">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-accent" />
        {label}
      </label>
      {description && <p className="mt-1 text-xs text-faint">{description}</p>}
    </div>
  )
}
