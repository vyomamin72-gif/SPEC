import { Button } from '@/components/ui/Button'
import { formatScalar } from '@/utils/format'

export interface TransportBarProps {
  isRunning: boolean
  /** Simulated time elapsed, in seconds. */
  simTime: number
  /** Ratio of simulated seconds to real seconds. */
  speed: number
  speedOptions: readonly number[]
  onPlayPause: () => void
  onReset: () => void
  /** Advance by exactly one fixed timestep. Only meaningful while paused. */
  onStep: () => void
  onSpeedChange: (speed: number) => void
  /** True when the simulation cannot keep up with the requested speed. */
  isFallingBehind?: boolean
  /** The experiment has ended (e.g. landed); Play then restarts it. */
  isFinished?: boolean
  /** Unit of `simTime` (default seconds). */
  timeUnit?: string
  /** Explains what 1× means when it is not one second per second, e.g. "1× = 1 day/s". */
  rateNote?: string
}

export function TransportBar({
  isRunning,
  simTime,
  speed,
  speedOptions,
  onPlayPause,
  onReset,
  onStep,
  onSpeedChange,
  isFallingBehind = false,
  isFinished = false,
  timeUnit = 's',
  rateNote,
}: TransportBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Simulation controls"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2"
    >
      <Button variant="primary" onClick={onPlayPause} aria-pressed={isRunning} className="w-20">
        {isRunning ? 'Pause' : isFinished ? 'Replay' : 'Play'}
      </Button>
      <Button onClick={onStep} disabled={isRunning || isFinished} title="Advance one timestep (available while paused)">
        Step
      </Button>
      <Button onClick={onReset}>Reset</Button>

      <label className="ml-2 flex items-center gap-2 text-muted">
        Speed
        <select
          aria-label="Simulation speed"
          value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
          className="numeric h-8 rounded border border-line-strong bg-base px-2 text-ink"
        >
          {speedOptions.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </select>
      </label>
      {rateNote && <span className="text-xs text-faint">{rateNote}</span>}

      <div className="ml-auto flex items-center gap-3">
        {isFinished && <span className="text-xs text-ok">Run complete</span>}
        {isFallingBehind && (
          <span className="text-xs text-warn" role="status">
            Running slower than requested
          </span>
        )}
        {/* Deliberately not an <output>/live region: it changes ~10×/s while
            running and would flood screen readers with announcements. */}
        <span className="text-muted">
          Simulated time{' '}
          <span data-testid="sim-time" className="numeric text-ink">
            {formatScalar(simTime, { sigFigs: 4 })}
          </span>{' '}
          {timeUnit}
        </span>
      </div>
    </div>
  )
}
