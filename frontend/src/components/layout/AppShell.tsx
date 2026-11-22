import { Link, Outlet } from 'react-router'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import type { BackendStatus } from '@/hooks/useBackendStatus'

const STATUS_TEXT: Record<BackendStatus, string> = {
  checking: 'Checking storage server…',
  online: 'Storage server online',
  offline: 'Storage server offline',
}

const STATUS_DOT: Record<BackendStatus, string> = {
  checking: 'bg-faint',
  online: 'bg-ok',
  // Offline is not an error: simulations never need the server.
  offline: 'bg-faint',
}

function BackendIndicator() {
  const status = useBackendStatus()
  return (
    <span
      className="flex items-center gap-2 text-xs text-muted"
      title="Simulations run entirely in your browser. The server is only used to save and load experiments."
      data-testid="backend-status"
      data-status={status}
    >
      <span aria-hidden className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_TEXT[status]}
    </span>
  )
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line bg-base px-4">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-ink hover:text-accent-strong">
          <img src="/favicon.svg" alt="" className="size-6" />
          Physics Laboratory
        </Link>
        <BackendIndicator />
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
