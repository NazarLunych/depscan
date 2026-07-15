'use client'

import { useMemo } from 'react'

import { useAnalysisStore } from '@/stores/analysisStore'
import type { PackageState } from '@/types'

import { FileUpload } from '@/components/FileUpload'
import { PackageCard } from '@/components/PackageCard'
import { ProgressBar } from '@/components/ProgressBar'
import { useAnalysis } from '@/hooks/useAnalysis'

function deriveSummary(order: string[], packages: Record<string, PackageState>) {
  let done = 0
  let failed = 0

  for (const name of order) {
    const status = packages[name]?.status

    if (status === 'done') done++
    else if (status === 'error') failed++
  }

  return { done, failed, total: order.length }
}

export default function HomePage() {
  const { startAnalysis, cancelAnalysis, isRunning, error } = useAnalysis()

  const order = useAnalysisStore((state) => state.order)

  const packages = useAnalysisStore((state) => state.packages)

  const summary = useMemo(() => deriveSummary(order, packages), [order, packages])

  const fatalError = useAnalysisStore((state) => state.fatalError)

  const hasResults = order.length > 0

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">DepScan</h1>
        <p className="mt-3 text-lg text-zinc-400">AI-powered dependency analyzer</p>
      </div>

      <FileUpload onSubmit={startAnalysis} disabled={isRunning} />

      {(error ?? fatalError) && (
        <p className="w-full max-w-2xl text-sm break-words text-red-400">{error ?? fatalError}</p>
      )}

      {hasResults && (
        <div className="w-full max-w-2xl space-y-4">
          <div className="flex items-center gap-4">
            <ProgressBar done={summary.done} failed={summary.failed} total={summary.total} />

            {isRunning && (
              <button
                type="button"
                onClick={cancelAnalysis}
                className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="space-y-3">
            {order.map((name) => {
              const pkg = packages[name]

              return pkg ? <PackageCard key={name} pkg={pkg} /> : null
            })}
          </div>
        </div>
      )}
    </main>
  )
}
