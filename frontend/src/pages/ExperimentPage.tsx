import { Link, useParams } from 'react-router'
import { AvailabilityBadge, FidelityBadge } from '@/components/ExperimentCard'
import { findExperiment } from '@/catalog/experiments'
import { FIDELITY_LABELS, getModule } from '@/catalog/modules'
import { ExperimentWorkspace } from '@/components/simulation/ExperimentWorkspace'
import { SIMULATIONS } from '@/simulations/registry'
import { NotFoundPage } from './NotFoundPage'

/**
 * Experiment entry point. Until an experiment's simulation is implemented,
 * this page states that plainly and documents the model that will be used.
 */
export function ExperimentPage() {
  const { experimentId = '' } = useParams()
  const experiment = findExperiment(experimentId)
  if (!experiment) return <NotFoundPage />
  const definition = SIMULATIONS[experiment.id]
  if (definition && experiment.availability.status === 'available') {
    // key: a fresh controller per experiment when navigating between labs
    return <ExperimentWorkspace key={experiment.id} experiment={experiment} definition={definition} />
  }

  const module = getModule(experiment.module)
  const fidelity = FIDELITY_LABELS[experiment.fidelity]

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <Link to="/" className="inline-block text-sm text-accent hover:text-accent-strong">
        ← All laboratories
      </Link>
      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">{module.title}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{experiment.title}</h1>
        <div className="flex flex-wrap gap-1.5">
          <FidelityBadge experiment={experiment} />
          <AvailabilityBadge experiment={experiment} />
        </div>
        <p className="text-base text-muted">{experiment.summary}</p>
      </header>

      {experiment.availability.status === 'planned' && (
        <div role="note" className="rounded-lg border border-line bg-surface p-4">
          This simulation is not implemented yet. It is scheduled for{' '}
          <strong className="font-semibold">{experiment.availability.phase}</strong> of the development roadmap.
        </div>
      )}

      <section className="space-y-2 rounded-lg border border-line bg-base p-4">
        <h2 className="font-semibold">Model and assumptions</h2>
        <p className="text-muted">{experiment.modelNotes}</p>
        <p className="text-sm text-faint">
          <span className="text-muted">{fidelity.label}:</span> {fidelity.description}
        </p>
      </section>
    </div>
  )
}
