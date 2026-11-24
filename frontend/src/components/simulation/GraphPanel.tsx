import { useState } from 'react'
import { LiveChart } from '@/charts/LiveChart'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { SAMPLE_CAPACITY } from '@/simulations/controller'
import type { ControllerSnapshot, SimulationController } from '@/simulations/controller'

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function GraphPanel({ controller, snapshot }: { controller: SimulationController; snapshot: ControllerSnapshot }) {
  const { charts, channels, id } = controller.definition
  const [chartId, setChartId] = useState(charts[0]?.id)
  const chart = charts.find((c) => c.id === chartId) ?? charts[0]

  return (
    <Panel
      title="Graphs"
      className="h-full"
      actions={
        <span className="numeric text-xs text-faint" data-testid="sample-count" title={`At most ${SAMPLE_CAPACITY} samples are kept; older ones are dropped.`}>
          {snapshot.sampleCount} samples
        </span>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="Chart" className="flex flex-wrap gap-1">
            {charts.map((c) => (
              <Button key={c.id} size="sm" variant={c.id === chart?.id ? 'primary' : 'ghost'} aria-pressed={c.id === chart?.id} onClick={() => setChartId(c.id)}>
                {c.title}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            <Button size="sm" aria-pressed={snapshot.recordingPaused} onClick={() => controller.setRecordingPaused(!snapshot.recordingPaused)}>
              {snapshot.recordingPaused ? 'Resume recording' : 'Pause recording'}
            </Button>
            <Button size="sm" onClick={() => controller.clearRecording()}>
              Clear
            </Button>
            <Button
              size="sm"
              disabled={snapshot.sampleCount === 0}
              onClick={() => download(`${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`, controller.toCsv())}
            >
              Export CSV
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {snapshot.isStatic && snapshot.sampleCount <= 1 ? (
            <p className="flex h-full items-center justify-center text-center text-sm text-faint">
              Nothing changes over time in this configuration, so there is nothing to plot. Use the measurements panel.
            </p>
          ) : chart && <LiveChart key={chart.id} chart={chart} channels={channels} getData={controller.chartData} dataVersion={snapshot.dataVersion} timeUnit={snapshot.clock.unit} />}
        </div>
        <p className="text-xs text-faint">Solid: simulation. Dashed: analytic theory (blank where it does not apply).</p>
      </div>
    </Panel>
  )
}
