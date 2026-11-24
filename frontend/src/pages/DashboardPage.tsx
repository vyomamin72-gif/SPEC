import { ExperimentCard } from '@/components/ExperimentCard'
import { EXPERIMENTS } from '@/catalog/experiments'
import { FIDELITY_LABELS, MODULES } from '@/catalog/modules'
import type { ModelFidelity } from '@/catalog/types'

const FIDELITY_ORDER: ModelFidelity[] = ['numerical', 'analytic', 'simplified']

export function DashboardPage() {
  const availableCount = EXPERIMENTS.filter((e) => e.availability.status === 'available').length

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-6">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Physics Laboratory</h1>
        <p className="max-w-3xl text-base text-muted">
          Experiment with physical systems whose behaviour is computed by numerically integrating their equations of
          motion. Change the parameters, observe the outcome, and compare the simulation against theory.
        </p>
        <p className="text-sm text-muted" data-testid="availability-summary">
          <span className="numeric text-ink">{availableCount}</span> of{' '}
          <span className="numeric text-ink">{EXPERIMENTS.length}</span> experiments available.
        </p>
        {availableCount === 0 && (
          <div role="note" className="max-w-3xl rounded-lg border border-warn/40 bg-warn/5 p-4 text-sm text-ink">
            <strong className="font-semibold">In development.</strong> No simulation is runnable yet: the physics
            engine is being built first, then the projectile, pendulum and Newton’s-laws laboratories. The catalogue
            below lists every planned laboratory and the model it will use.
          </div>
        )}
      </section>

      <section aria-labelledby="fidelity-heading" className="space-y-3">
        <h2 id="fidelity-heading" className="text-sm font-semibold tracking-wider text-muted uppercase">
          How to read the model labels
        </h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          {FIDELITY_ORDER.map((key) => (
            <div key={key} className="rounded-lg border border-line bg-base p-3">
              <dt className="font-medium text-ink">{FIDELITY_LABELS[key].label}</dt>
              <dd className="mt-1 text-muted">{FIDELITY_LABELS[key].description}</dd>
            </div>
          ))}
        </dl>
      </section>

      {MODULES.map((module) => (
        <section key={module.id} aria-labelledby={`module-${module.id}`} className="space-y-4">
          <div>
            <h2 id={`module-${module.id}`} className="text-lg font-semibold">
              {module.title}
            </h2>
            <p className="text-muted">{module.description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXPERIMENTS.filter((e) => e.module === module.id).map((experiment) => (
              <ExperimentCard key={experiment.id} experiment={experiment} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
