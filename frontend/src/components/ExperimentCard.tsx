import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { FIDELITY_LABELS } from '@/catalog/modules'
import type { ExperimentInfo } from '@/catalog/types'

export function AvailabilityBadge({ experiment }: { experiment: ExperimentInfo }) {
  const { availability } = experiment
  return availability.status === 'available' ? (
    <Badge tone="ok">Available</Badge>
  ) : (
    <Badge title="This simulation has not been implemented yet">Planned · {availability.phase}</Badge>
  )
}

export function FidelityBadge({ experiment }: { experiment: ExperimentInfo }) {
  const fidelity = FIDELITY_LABELS[experiment.fidelity]
  return (
    <Badge tone={experiment.fidelity === 'simplified' ? 'warn' : 'accent'} title={fidelity.description}>
      {fidelity.label}
    </Badge>
  )
}

export function ExperimentCard({ experiment }: { experiment: ExperimentInfo }) {
  return (
    <Link
      to={`/lab/${experiment.id}`}
      className="group flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-raised"
    >
      <h3 className="font-semibold text-ink group-hover:text-accent-strong">{experiment.title}</h3>
      <p className="flex-1 text-muted">{experiment.summary}</p>
      <div className="flex flex-wrap gap-1.5">
        <FidelityBadge experiment={experiment} />
        <AvailabilityBadge experiment={experiment} />
      </div>
    </Link>
  )
}
