import { useAnalysisStore } from '@/stores/analysisStore'
import type { PackageJsonInput } from '@/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnalysis } from '@/hooks/useAnalysis'

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

function streamResponse(chunks: string[], init: ResponseInit = { status: 200 }): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }

      controller.close()
    },
  })

  return new Response(stream, init)
}

const packageJson: PackageJsonInput = {
  dependencies: { react: '^18.2.0', lodash: '^4.17.21' },
}

const analysisFor = (name: string) => ({
  package: name,
  current_version: '18.2.0',
  target_version: '19.0.0',
  breaking_changes: [],
  migration_steps: [],
  security_risks: 'none' as const,
  roi: 'low' as const,
  highlight: 'none' as const,
})

describe('useAnalysis', () => {
  beforeEach(() => {
    useAnalysisStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('happy path: started -> package-done x2 -> done updates the store', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      streamResponse([
        sseEvent('started', { total: 2 }),
        sseEvent('package-done', { name: 'react', analysis: analysisFor('react') }),
        sseEvent('package-done', { name: 'lodash', analysis: analysisFor('lodash') }),
        sseEvent('done', { total: 2, failed: 0 }),
      ]),
    )

    const { result } = renderHook(() => useAnalysis())

    await act(async () => {
      await result.current.startAnalysis(packageJson, false)
    })

    await waitFor(() => {
      expect(useAnalysisStore.getState().isRunning).toBe(false)
    })

    const state = useAnalysisStore.getState()

    expect(state.packages.react?.status).toBe('done')
    expect(state.packages.lodash?.status).toBe('done')
    expect(state.getSummary()).toEqual({ total: 2, done: 2, failed: 0, critical: 0 })
    expect(result.current.error).toBeNull()
  })

  it('mixes in a per-package error event without crashing the stream', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      streamResponse([
        sseEvent('started', { total: 2 }),
        sseEvent('package-done', { name: 'react', analysis: analysisFor('react') }),
        sseEvent('error', { name: 'lodash', message: 'registry 404' }),
        sseEvent('done', { total: 2, failed: 1 }),
      ]),
    )

    const { result } = renderHook(() => useAnalysis())

    await act(async () => {
      await result.current.startAnalysis(packageJson, false)
    })

    const state = useAnalysisStore.getState()

    expect(state.packages.react?.status).toBe('done')
    expect(state.packages.lodash?.status).toBe('error')
    expect(state.packages.lodash?.error).toBe('registry 404')
    expect(state.getSummary().failed).toBe(1)
  })

  it('ignores heartbeat comments and chunks split across reads', async () => {
    const encoder = new TextEncoder()
    const fullChunk = sseEvent('package-done', { name: 'react', analysis: analysisFor('react') })
    const splitPoint = Math.floor(fullChunk.length / 2)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseEvent('started', { total: 1 })))
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
        controller.enqueue(encoder.encode(fullChunk.slice(0, splitPoint)))
        controller.enqueue(encoder.encode(fullChunk.slice(splitPoint)))
        controller.enqueue(encoder.encode(sseEvent('done', { total: 1, failed: 0 })))
        controller.close()
      },
    })

    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(stream, { status: 200 }))

    const { result } = renderHook(() => useAnalysis())

    await act(async () => {
      await result.current.startAnalysis({ dependencies: { react: '^18.2.0' } }, false)
    })

    expect(useAnalysisStore.getState().packages.react?.status).toBe('done')
  })

  it('tolerates a malformed chunk without throwing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      streamResponse([
        sseEvent('started', { total: 1 }),
        'event: package-done\ndata: not-json\n\n',
        sseEvent('done', { total: 1, failed: 0 }),
      ]),
    )

    const { result } = renderHook(() => useAnalysis())

    await expect(
      act(async () => {
        await result.current.startAnalysis({ dependencies: { react: '^18.2.0' } }, false)
      }),
    ).resolves.not.toThrow()
  })

  it('sets hook-level error and does not touch the store on a non-OK response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 }),
    )

    const { result } = renderHook(() => useAnalysis())

    await act(async () => {
      await result.current.startAnalysis({ dependencies: { react: '^18.2.0' } }, false)
    })

    expect(result.current.error).toBe('Invalid request')
    expect(useAnalysisStore.getState().fatalError).toBe('Invalid request')
  })

  it('treats an aborted fetch as a clean stop, not an error', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      const abortError = new DOMException('The operation was aborted', 'AbortError')

      return Promise.reject(abortError)
    })

    const { result } = renderHook(() => useAnalysis())

    await act(async () => {
      await result.current.startAnalysis({ dependencies: { react: '^18.2.0' } }, false)
    })

    expect(result.current.error).toBeNull()
    expect(useAnalysisStore.getState().isRunning).toBe(false)
  })

  it('cancelAnalysis aborts the in-flight request and clears isRunning without an error', async () => {
    let capturedSignal: AbortSignal | undefined

    vi.spyOn(global, 'fetch').mockImplementation((_input, init) => {
      capturedSignal = (init as RequestInit).signal ?? undefined

      return new Promise((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })
    })

    const { result } = renderHook(() => useAnalysis())

    const analysisPromise = act(async () => {
      await result.current.startAnalysis({ dependencies: { react: '^18.2.0' } }, false)
    })

    result.current.cancelAnalysis()
    await analysisPromise

    expect(capturedSignal?.aborted).toBe(true)
    expect(result.current.error).toBeNull()
    expect(useAnalysisStore.getState().isRunning).toBe(false)
    expect(useAnalysisStore.getState().fatalError).toBeNull()
    expect(useAnalysisStore.getState().packages.react?.status).toBe('error')
    expect(useAnalysisStore.getState().packages.react?.error).toBe('Cancelled')
  })
})
