import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong text-muted',
  accent: 'border-accent/50 text-accent',
  ok: 'border-ok/50 text-ok',
  warn: 'border-warn/50 text-warn',
}

export function Badge({ tone = 'neutral', title, children }: { tone?: BadgeTone; title?: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-wide uppercase ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
