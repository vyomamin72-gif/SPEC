import { useEffect, useState } from 'react'
import { fetchHealth } from '@/services/api'

export type BackendStatus = 'checking' | 'online' | 'offline'

const TIMEOUT_MS = 3000

/** Checks once, on mount, whether the persistence server is reachable. */
export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('checking')

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
    fetchHealth(controller.signal)
      .then(() => setStatus('online'))
      .catch(() => {
        // Covers unreachable, timeout and error responses alike. The only
        // abort that should *not* report offline is unmount, which is
        // harmless because React ignores state updates after unmount.
        setStatus('offline')
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [])

  return status
}
