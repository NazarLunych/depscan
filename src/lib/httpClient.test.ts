// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchWithRetry, withTimeout } from '@/lib/httpClient'

describe('withTimeout', () => {
  it('returns a bare timeout signal when no caller signal is given', () => {
    const signal = withTimeout(undefined, 10_000)

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it('combines the caller signal with the timeout signal', () => {
    const controller = new AbortController()
    const signal = withTimeout(controller.signal, 10_000)

    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
  })
})

describe('fetchWithRetry', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns the response as-is when not rate limited', async () => {
    const okResponse = new Response(null, { status: 200 })

    vi.mocked(global.fetch).mockResolvedValue(okResponse)

    const res = await fetchWithRetry('https://example.com', {})

    expect(res).toBe(okResponse)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('retries once on a 429 and returns the second response', async () => {
    const rateLimited = new Response(null, { status: 429 })
    const success = new Response(null, { status: 200 })

    vi.mocked(global.fetch).mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(success)

    const res = await fetchWithRetry('https://example.com', {})

    expect(res).toBe(success)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry again if the second attempt is also 429', async () => {
    const rateLimited = new Response(null, { status: 429 })

    vi.mocked(global.fetch).mockResolvedValue(rateLimited)

    const res = await fetchWithRetry('https://example.com', {})

    expect(res.status).toBe(429)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('skips the retry when the signal is already aborted', async () => {
    const rateLimited = new Response(null, { status: 429 })

    vi.mocked(global.fetch).mockResolvedValue(rateLimited)

    const controller = new AbortController()

    controller.abort()

    const res = await fetchWithRetry('https://example.com', {}, controller.signal)

    expect(res.status).toBe(429)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
