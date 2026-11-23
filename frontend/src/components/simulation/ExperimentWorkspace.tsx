import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { TransportBar } from '@/components/layout/TransportBar'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { Panel } from '@/components/ui/Panel'
import { Readout } from '@/components/ui/Readout'
import { FidelityBadge } from '@/components/ExperimentCard'
import type { ExperimentInfo } from '@/catalog/types'
import { SimulationController } from '@/simulations/controller'
import type { SimulationDefinition } from '@/simulations/types'
import { ParameterList } from './ParameterList'

export const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1, 2, 4, 8] as const

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
}

/** Keyboard shortcuts: Space play/pause, R reset, → step (while paused). */
function useKeyboardShortcuts(controller: SimulationController) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      if (event.key === ' ') {
        event.preventDefault()
        controller.toggle()
      } else if (event.key === 'r' || event.key === 'R') controller.reset()
      else if (event.key === 'ArrowRight') controller.step()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [controller])
}

export function ExperimentWorkspace({ experiment, definition }: { experiment: ExperimentInfo; definition: SimulationDefinition }) {
  const [controller] = useState(() => new SimulationController(definition))
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useEffect(() => () => controller.pause(false), [controller])
  useKeyboardShortcuts(controller)
  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => controller.attachCanvas(canvas), [controller])

  return (
    // lg:flex-none: with flex-1 the zero flex basis would override the fixed height.
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-3rem)] lg:flex-none">
      <WorkspaceLayout
        left={
          <Panel title="Parameters" className="h-full">
            <div className="mb-3 space-y-2 border-b border-line pb-3">
              <Link to="/" className="inline-block text-xs text-accent hover:text-accent-strong">
                ← All laboratories
              </Link>
              <h1 className="text-lg font-semibold">{experiment.title}</h1>
              <FidelityBadge experiment={experiment} />
            </div>
            <ParameterList
              parameters={definition.parameters}
              values={snapshot.values}
              onChange={(key, value) => controller.setParameter(key, value)}
            />
          </Panel>
        }
        center={
          <Panel title="Simulation" className="h-full">
            <div className="relative h-full min-h-64">
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={definition.canvasDescription}
                className="absolute inset-0 size-full rounded"
              />
            </div>
          </Panel>
        }
        right={
          <div className="flex h-full min-h-0 flex-col gap-2">
            <Panel title="Measurements" className="min-h-0 flex-[3]">
              <div className="space-y-4">
                {snapshot.readouts.map((group) => (
                  <section key={group.title} aria-label={group.title}>
                    <h3 className="mb-1 text-xs font-semibold text-muted">{group.title}</h3>
                    <dl className="divide-y divide-line/50">
                      {group.items.map((item) => (
                        <Readout key={item.label} {...item} />
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </Panel>
            <Panel title="Model & equations" className="min-h-0 flex-[2]">
              <div className="space-y-3">
                {snapshot.notices.map((notice) => (
                  <p key={notice} role="note" className="rounded border border-warn/40 bg-warn/5 p-2 text-xs text-ink">
                    {notice}
                  </p>
                ))}
                <dl className="space-y-2">
                  {definition.equations.map((eq) => (
                    <div key={eq.label}>
                      <dt className="text-xs text-muted">{eq.label}</dt>
                      <dd className="numeric text-ink">{eq.expression}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-faint">{experiment.modelNotes}</p>
                <p className="text-xs text-faint">Shortcuts: Space play/pause · R reset · → step</p>
              </div>
            </Panel>
          </div>
        }
        bottom={
          <TransportBar
            isRunning={snapshot.isRunning}
            simTime={snapshot.time}
            speed={snapshot.speed}
            speedOptions={SPEED_OPTIONS}
            isFallingBehind={snapshot.fellBehind}
            onPlayPause={() => (snapshot.finished ? controller.reset() : controller.toggle())}
            onReset={() => controller.reset()}
            onStep={() => controller.step()}
            onSpeedChange={(s) => controller.setSpeed(s)}
            isFinished={snapshot.finished}
          />
        }
      />
    </div>
  )
}
