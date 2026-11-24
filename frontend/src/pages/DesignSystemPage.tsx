import { useState } from 'react'
import { TransportBar } from '@/components/layout/TransportBar'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { ParameterControl } from '@/components/ui/ParameterControl'
import { Readout } from '@/components/ui/Readout'

/*
 * Development-only component reference (route /dev/design-system, excluded
 * from production builds). Controls here change local demo state only; no
 * simulation is attached.
 */

const SURFACES = ['canvas', 'base', 'surface', 'raised', 'line', 'line-strong'] as const
const TEXT = ['ink', 'muted', 'faint', 'accent'] as const
const QUANTITIES = ['position', 'velocity', 'acceleration', 'force', 'energy', 'momentum', 'theory'] as const

function Swatch({ token }: { token: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-6 rounded border border-line-strong" style={{ background: `var(--color-${token})` }} />
      <code className="numeric text-xs text-muted">{token}</code>
    </div>
  )
}

export default function DesignSystemPage() {
  const [angle, setAngle] = useState(45)
  const [speed, setSpeed] = useState(20)
  const [isRunning, setIsRunning] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)

  return (
    <div className="space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Design system reference</h1>
        <p className="text-muted">Development only. Controls below change demo state; no simulation is attached.</p>
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold">Colour tokens</h2>
        <div className="flex flex-wrap gap-4">{SURFACES.map((t) => <Swatch key={t} token={t} />)}</div>
        <div className="flex flex-wrap gap-4">{TEXT.map((t) => <Swatch key={t} token={t} />)}</div>
        <div className="flex flex-wrap gap-4">{QUANTITIES.map((t) => <Swatch key={t} token={`q-${t}`} />)}</div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Controls</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Badge>Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="ok">OK</Badge>
          <Badge tone="warn">Warn</Badge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Workspace layout</h2>
        <div className="h-[560px] rounded-lg border border-dashed border-line-strong">
          <WorkspaceLayout
            left={
              <Panel title="Parameters" className="h-full">
                <ParameterControl label="Launch angle" unit="°" value={angle} min={0} max={90} step={1} onChange={setAngle} />
                <ParameterControl
                  label="Initial speed"
                  unit="m/s"
                  value={speed}
                  min={0}
                  max={100}
                  step={0.5}
                  onChange={setSpeed}
                  description="Magnitude of the launch velocity."
                />
              </Panel>
            }
            center={
              <Panel title="Canvas" className="h-full">
                <p className="text-faint">The simulation canvas renders here.</p>
              </Panel>
            }
            right={
              <Panel title="Measurements" className="h-full">
                <dl>
                  <Readout label="Gravitational acceleration" value={9.80665} unit="m/s²" />
                  <Readout label="Gravitational constant" value={6.6743e-11} unit="N·m²/kg²" sigFigs={5} />
                  <Readout label="Undefined quantity" value={Number.NaN} unit="s" />
                </dl>
              </Panel>
            }
            bottom={
              <TransportBar
                isRunning={isRunning}
                simTime={0}
                speed={playbackSpeed}
                speedOptions={[0.25, 0.5, 1, 2, 4]}
                onPlayPause={() => setIsRunning((r) => !r)}
                onReset={() => setIsRunning(false)}
                onStep={() => {}}
                onSpeedChange={setPlaybackSpeed}
              />
            }
          />
        </div>
      </section>
    </div>
  )
}
