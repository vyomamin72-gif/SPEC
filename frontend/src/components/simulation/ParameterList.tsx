import { ChoiceControl } from '@/components/ui/ChoiceControl'
import { ParameterControl } from '@/components/ui/ParameterControl'
import { ToggleControl } from '@/components/ui/ToggleControl'
import type { ParameterSpec, ParameterValue, ParameterValues } from '@/simulations/types'

export function ParameterList({
  parameters,
  values,
  onChange,
}: {
  parameters: readonly ParameterSpec[]
  values: ParameterValues
  onChange: (key: string, value: ParameterValue) => void
}) {
  return (
    <div className="divide-y divide-line/60">
      {parameters
        .filter((p) => !p.visibleWhen || p.visibleWhen(values))
        .map((p) => {
          switch (p.kind) {
            case 'number':
              return (
                <ParameterControl
                  key={p.key}
                  label={p.label}
                  unit={p.unit}
                  value={values[p.key] as number}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  description={p.description}
                  onChange={(v) => onChange(p.key, v)}
                />
              )
            case 'choice':
              return (
                <ChoiceControl
                  key={p.key}
                  label={p.label}
                  value={values[p.key] as string}
                  options={p.options}
                  description={p.description}
                  onChange={(v) => onChange(p.key, v)}
                />
              )
            case 'boolean':
              return (
                <ToggleControl
                  key={p.key}
                  label={p.label}
                  checked={values[p.key] as boolean}
                  description={p.description}
                  onChange={(v) => onChange(p.key, v)}
                />
              )
          }
        })}
      <p className="pt-3 text-xs text-faint">Changing a parameter resets the run, except those marked as changeable while running.</p>
    </div>
  )
}
