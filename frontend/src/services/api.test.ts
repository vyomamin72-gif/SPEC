import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fetchHealth } from './api'

function mockFetch(implementation: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(implementation))
}

describe('fetchHealth', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns a valid health response', async () => {
    mockFetch(async () => Response.json({ status: 'ok', version: '0.1.0' }))
    await expect(fetchHealth()).resolves.toEqual({ status: 'ok', version: '0.1.0' })
  })

  it('reports an unreachable server as ApiError with no status', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(fetchHealth()).rejects.toMatchObject({ name: 'ApiError', status: null })
  })

  it('reports HTTP errors with their status', async () => {
    mockFetch(async () => new Response('nope', { status: 503 }))
    await expect(fetchHealth()).rejects.toMatchObject({ status: 503 })
  })

  it('rejects a response with the wrong shape', async () => {
    mockFetch(async () => Response.json({ hello: 'world' }))
    await expect(fetchHealth()).rejects.toBeInstanceOf(ApiError)
  })
})
