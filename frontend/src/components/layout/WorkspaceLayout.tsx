import type { ReactNode } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export interface WorkspaceLayoutProps {
  /** Experiment selection and parameter controls. */
  left: ReactNode
  /** The simulation canvas. */
  center: ReactNode
  /** Measurements, equations and graphs. */
  right: ReactNode
  /** Transport controls (play, pause, reset, step, speed, time). */
  bottom: ReactNode
}

export const DESKTOP_QUERY = '(min-width: 1024px)'

function ResizeHandle() {
  return (
    <Separator className="group flex w-2 items-center justify-center outline-none">
      <div className="h-10 w-0.5 rounded bg-line transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-data-[separator=active]:bg-accent" />
    </Separator>
  )
}

/**
 * Three-panel simulation workspace with a bottom transport bar.
 *
 * Desktop: left | centre | right, resizable by dragging or with the keyboard
 * (focus a handle, then use the arrow keys).
 * Narrow screens: panels stack vertically — canvas first, because it is the
 * subject of the experiment, then parameters, then measurements.
 */
export function WorkspaceLayout({ left, center, right, bottom }: WorkspaceLayoutProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-2 p-2" data-testid="workspace-stacked">
        <div className="h-[55vh] min-h-64">{center}</div>
        <div className="sticky bottom-0 z-10">{bottom}</div>
        <div>{left}</div>
        <div>{right}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2" data-testid="workspace-resizable">
      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel id="parameters" defaultSize="22%" minSize="16%" maxSize="35%">
          <div className="h-full">{left}</div>
        </Panel>
        <ResizeHandle />
        <Panel id="canvas" minSize="30%">
          <div className="h-full">{center}</div>
        </Panel>
        <ResizeHandle />
        <Panel id="measurements" defaultSize="28%" minSize="18%" maxSize="45%">
          <div className="h-full">{right}</div>
        </Panel>
      </Group>
      <div className="shrink-0">{bottom}</div>
    </div>
  )
}
