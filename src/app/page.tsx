'use client'

import { useAnalysisStore } from '@/stores/analysisStore'

import { FileUpload } from '@/components/FileUpload'
import { PackageCard } from '@/components/PackageCard'
import { ProgressBar } from '@/components/ProgressBar'
import { useAnalysis } from '@/hooks/useAnalysis'

export default function HomePage() {
  const { startAnalysis, isRunning, error } = useAnalysis()

  const order = useAnalysisStore((state) => state.order)

  const packages = useAnalysisStore((state) => state.packages)

  const summary = useAnalysisStore((state) => state.summary)

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
          <ProgressBar done={summary.done} failed={summary.failed} total={summary.total} />

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
