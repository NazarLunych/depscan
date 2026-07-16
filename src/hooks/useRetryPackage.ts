import { useCallback } from 'react'

import { useAnalysisStore } from '@/stores/analysisStore'

import { AnalyzerResultSchema } from '@/lib/schemas'

interface RetryErrorBody {
  error?: unknown
}

interface UseRetryPackageResult {
  retryPackage: (name: string, versionRange: string) => Promise<void>
}

export function useRetryPackage(): UseRetryPackageResult {
  const retryPackage = useCallback(async (name: string, versionRange: string): Promise<void> => {
    const store = useAnalysisStore.getState()

    store.markAnalyzing(name)

    try {
      const response = await fetch('/api/analyze/retry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, versionRange }),
      })

      if (!response.ok) {
        const body: RetryErrorBody = await response.json().catch(() => ({}))
        const message = typeof body.error === 'string' ? body.error : 'Retry failed'

        store.markError(name, message)

        return
      }

      const parsed = AnalyzerResultSchema.safeParse(await response.json())

      if (!parsed.success) {
        store.markError(name, 'Received unexpected data — retry failed.')

        return
      }

      if (parsed.data.status === 'done') {
        store.markDone(name, parsed.data.analysis)
      } else {
        store.markError(name, parsed.data.error)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      store.markError(name, message)
    }
  }, [])

  return { retryPackage }
}
