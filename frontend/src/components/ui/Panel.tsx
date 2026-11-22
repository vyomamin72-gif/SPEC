import type { ReactNode } from 'react'

export interface PanelProps {
  title: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** A titled region of the workspace (parameters, measurements, graphs…). */
export function Panel({ title, actions, children, className = '' }: PanelProps) {
  return (
    <section aria-label={title} className={`flex min-h-0 flex-col rounded-lg border border-line bg-surface ${className}`}>
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{title}</h2>
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  )
}
