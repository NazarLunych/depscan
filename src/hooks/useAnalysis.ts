import { useCallback, useEffect, useRef, useState } from 'react'

import { useAnalysisStore } from '@/stores/analysisStore'
import type { PackageJsonInput } from '@/types'

import { mergePackageJsonDependencies } from '@/lib/packageJson'
import { SseEventSchema } from '@/lib/schemas'

interface UseAnalysisResult {
  startAnalysis: (packageJson: PackageJsonInput, includeDevDependencies: boolean) => Promise<void>
  cancelAnalysis: () => void
  isRunning: boolean
  error: string | null
}

type Store = ReturnType<typeof useAnalysisStore.getState>
type SetError = (message: string | null) => void

function collectEntries(
  packageJson: PackageJsonInput,
  includeDevDependencies: boolean,
): Array<{ name: string; versionRange: string }> {
  const dependencies = mergePackageJsonDependencies(packageJson, includeDevDependencies)

  return Object.entries(dependencies).map(([name, versionRange]) => ({ name, versionRange }))
}

function parseSseChunk(chunk: string): { type: string; data: unknown } | null {
  if (chunk.startsWith(':')) {
    return null
  }

  const typeLine = chunk.split('\n').find((line) => line.startsWith('event: '))

  const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '))

  if (!typeLine || !dataLine) {
    return null
  }

  try {
    return {
      type: typeLine.slice('event: '.length),
      data: JSON.parse(dataLine.slice('data: '.length)),
    }
  } catch {
    return null
  }
}

function dispatchSseEvent(rawChunk: string, store: Store): void {
  const parsed = parseSseChunk(rawChunk)

  if (!parsed) {
    return
  }

  const event = SseEventSchema.safeParse(parsed)

  if (!event.success) {
    return
  }

  switch (event.data.type) {
    case 'package-done':
      store.markDone(event.data.data.name, event.data.data.analysis)
      break
    case 'error':
      if (event.data.data.name) {
        store.markError(event.data.data.name, event.data.data.message)
      } else {
        store.setFatalError(event.data.data.message)
      }

      break
    case 'done':
      store.finish()
      break
    case 'started':
      break
  }
}

function consumeBuffer(buffer: string, store: Store): string {
  let boundary = buffer.indexOf('\n\n')

  while (boundary !== -1) {
    const rawChunk = buffer.slice(0, boundary)

    buffer = buffer.slice(boundary + 2)

    dispatchSseEvent(rawChunk, store)

    boundary = buffer.indexOf('\n\n')
  }

  return buffer
}

async function readAnalysisStream(reader: ReadableStreamDefaultReader<Uint8Array>, store: Store) {
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    buffer = consumeBuffer(buffer, store)
  }
}

async function handleErrorResponse(response: Response, store: Store, setError: SetError) {
  const body = await response.json().catch(() => ({ error: response.statusText }))
  const message = typeof body.error === 'string' ? body.error : 'Analysis request failed'

  setError(message)
  store.setFatalError(message)
}

export function useAnalysis(): UseAnalysisResult {
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const isRunning = useAnalysisStore((state) => state.isRunning)

  const startAnalysis = useCallback(
    async (packageJson: PackageJsonInput, includeDevDependencies: boolean): Promise<void> => {
      const store = useAnalysisStore.getState()
      const entries = collectEntries(packageJson, includeDevDependencies)

      setError(null)
      store.reset()
      store.initPackages(entries)
      entries.forEach((entry) => store.markAnalyzing(entry.name))

      abortControllerRef.current?.abort()
      const abortController = new AbortController()

      abortControllerRef.current = abortController

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ packageJson, includeDevDependencies }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          await handleErrorResponse(response, store, setError)

          return
        }

        const reader = response.body?.getReader()

        if (!reader) {
          throw new Error('Response body is not readable')
        }

        await readAnalysisStream(reader, store)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          store.cancel()

          return
        }

        const message = err instanceof Error ? err.message : String(err)

        setError(message)
        store.setFatalError(message)
      }
    },
    [],
  )

  const cancelAnalysis = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  return { startAnalysis, cancelAnalysis, isRunning, error }
}
