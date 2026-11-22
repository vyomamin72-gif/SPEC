/**
 * Minimal HTTP client for the backend.
 *
 * The backend is optional for running simulations: every simulation runs in
 * the browser. Only persistence (saving/loading experiments) needs it, so all
 * callers must handle the server being unreachable.
 */

export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiGet(path: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('Server unreachable', null)
  }
  if (!response.ok) throw new ApiError(`Request failed with status ${response.status}`, response.status)
  try {
    return await response.json()
  } catch {
    throw new ApiError('Server returned invalid JSON', response.status)
  }
}

export interface HealthResponse {
  status: 'ok'
  version: string
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).status === 'ok' &&
    typeof (value as Record<string, unknown>).version === 'string'
  )
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const body = await apiGet('/health', signal)
  if (!isHealthResponse(body)) throw new ApiError('Unexpected health response', null)
  return body
}
