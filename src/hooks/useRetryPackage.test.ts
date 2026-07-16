import { useAnalysisStore } from '@/stores/analysisStore'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRetryPackage } from '@/hooks/useRetryPackage'

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), init)
}

const analysis = {
  package: 'left-pad',
  current_version: '1.3.0',
  target_version: '1.3.0',
  breaking_changes: [],
  migration_steps: [],
  security_risks: 'none' as const,
  roi: 'low' as const,
  highlight: 'none' as const,
}

describe('useRetryPackage', () => {
  beforeEach(() => {
    useAnalysisStore.getState().reset()
    useAnalysisStore.getState().initPackages([{ name: 'left-pad', versionRange: '^1.1.0' }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks the package analyzing, then done on a successful retry', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'done',
        name: 'left-pad',
        currentVersion: '1.3.0',
        analysis,
      }),
    )

    const { result } = renderHook(() => useRetryPackage())

    await act(async () => {
      await result.current.retryPackage('left-pad', '^1.1.0')
    })

    const pkg = useAnalysisStore.getState().packages['left-pad']

    expect(pkg?.status).toBe('done')
    expect(pkg?.analysis).toEqual(analysis)
  })

  it('marks the package error when the analyzer result is an error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'error', name: 'left-pad', currentVersion: null, error: 'boom' }),
    )

    const { result } = renderHook(() => useRetryPackage())

    await act(async () => {
      await result.current.retryPackage('left-pad', '^1.1.0')
    })

    const pkg = useAnalysisStore.getState().packages['left-pad']

    expect(pkg?.status).toBe('error')
    expect(pkg?.error).toBe('boom')
  })

  it('marks the package error using the response body message on a non-OK response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'Too many requests' }, { status: 429 }),
    )

    const { result } = renderHook(() => useRetryPackage())

    await act(async () => {
      await result.current.retryPackage('left-pad', '^1.1.0')
    })

    expect(useAnalysisStore.getState().packages['left-pad']?.error).toBe('Too many requests')
  })

  it('falls back to a generic message when the response body has no error string', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, { status: 500 }))

    const { result } = renderHook(() => useRetryPackage())

    await act(async () => {
      await result.current.retryPackage('left-pad', '^1.1.0')
    })

    expect(useAnalysisStore.getState().packages['left-pad']?.error).toBe('Retry failed')
  })

  it('marks the package error when the response body fails schema validation', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ nonsense: true }))

    const { result } = renderHook(() => useRetryPackage())

    await act(async () => {
      await result.current.retryPackage('left-pad', '^1.1.0')
    })

    expect(useAnalysisStore.getState().packages['left-pad']?.error).toBe(
      'Received unexpected data — retry failed.',
    )
  })

  it('marks the package error with the thrown message on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useRetryPackage())

    await act(async () => {
      await result.current.retryPackage('left-pad', '^1.1.0')
    })

    expect(useAnalysisStore.getState().packages['left-pad']?.error).toBe('network down')
  })
})
