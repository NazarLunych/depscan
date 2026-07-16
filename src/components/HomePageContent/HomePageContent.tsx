'use client'

import { useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useAnalysisStore } from '@/stores/analysisStore'

import { FileUpload } from '@/components/FileUpload'
import { FilterSortToolbar } from '@/components/FilterSortToolbar'
import { PackageList } from '@/components/PackageList'
import { ProgressBar } from '@/components/ProgressBar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { useAnalysis } from '@/hooks/useAnalysis'

import {
  deriveVisibleOrder,
  parseHighlightFilter,
  parseSortMode,
  type HighlightFilter,
  type SortMode,
} from '@/lib/packageOrdering'

export function HomePageContent() {
  const { startAnalysis, cancelAnalysis, isRunning, error } = useAnalysis()

  const order = useAnalysisStore((state) => state.order)

  const packages = useAnalysisStore((state) => state.packages)

  const getSummary = useAnalysisStore((state) => state.getSummary)

  const summary = useMemo(
    // order/packages are the inputs getSummary reads; depending on them keeps
    // the memo honest even though it isn't called with them directly.
    () => getSummary(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getSummary, order, packages],
  )

  const fatalError = useAnalysisStore((state) => state.fatalError)

  const router = useRouter()
  const searchParams = useSearchParams()
  const filter = parseHighlightFilter(searchParams.get('filter'))
  const sort = parseSortMode(searchParams.get('sort'))

  const setFilter = useCallback(
    (next: HighlightFilter) => {
      const params = new URLSearchParams(searchParams.toString())

      if (next === 'all') {
        params.delete('filter')
      } else {
        params.set('filter', next)
      }

      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const setSort = useCallback(
    (next: SortMode) => {
      const params = new URLSearchParams(searchParams.toString())

      if (next === 'default') {
        params.delete('sort')
      } else {
        params.set('sort', next)
      }

      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const visibleOrder = useMemo(
    () => deriveVisibleOrder(order, packages, filter, sort),
    [order, packages, filter, sort],
  )

  const hasResults = order.length > 0

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 px-4 py-16">
      <div className="w-full max-w-2xl">
        <ThemeToggle />
      </div>

      <div className="text-center">
        <h1 className="text-fg text-4xl font-bold tracking-tight sm:text-5xl">DepScan</h1>
        <p className="text-muted mt-3 text-lg">AI-powered dependency analyzer</p>
      </div>

      <FileUpload onSubmit={startAnalysis} disabled={isRunning} />

      {(error ?? fatalError) && (
        <p role="alert" className="w-full max-w-2xl text-sm break-words text-red-400">
          {error ?? fatalError}
        </p>
      )}

      {hasResults && (
        <div className="w-full max-w-2xl space-y-4">
          <div className="flex items-center gap-4">
            <ProgressBar done={summary.done} failed={summary.failed} total={summary.total} />

            {isRunning && (
              <Button variant="secondary" className="shrink-0 px-3 py-1.5" onClick={cancelAnalysis}>
                Cancel
              </Button>
            )}
          </div>

          <FilterSortToolbar
            filter={filter}
            sort={sort}
            onFilterChange={setFilter}
            onSortChange={setSort}
          />

          <div aria-live="polite" aria-busy={isRunning}>
            <PackageList order={visibleOrder} packages={packages} />
          </div>
        </div>
      )}
    </main>
  )
}
