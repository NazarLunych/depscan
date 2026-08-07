import type { AnalyzerResult, PackageJsonInput } from '@/types'

import { analyzePackage } from '@/lib/analyzer'
import { fetchBulkAdvisories } from '@/lib/npmRegistry'
import { mergePackageJsonDependencies } from '@/lib/packageJson'

const ANALYSIS_CONCURRENCY = 3

export function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  onItemDone?: (result: R, index: number) => void,
  signal?: AbortSignal,
  // Called for every item never claimed by a worker because the signal
  // aborted mid-batch — without this, those slots stay `undefined` in the
  // returned array instead of a well-formed result.
  onSkipped?: (item: T, index: number) => R,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function runWorker(): Promise<void> {
    while (cursor < items.length && !signal?.aborted) {
      const index = cursor++
      const item = items[index] as T

      results[index] = await worker(item)
      onItemDone?.(results[index] as R, index)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runWorker)

  return Promise.all(workers).then(() => {
    if (onSkipped) {
      for (let index = 0; index < items.length; index++) {
        if (index >= cursor) {
          const item = items[index] as T

          results[index] = onSkipped(item, index)
          onItemDone?.(results[index] as R, index)
        }
      }
    }

    return results
  })
}

export function countDependencies(
  packageJson: PackageJsonInput,
  includeDevDependencies: boolean,
): number {
  return Object.keys(mergePackageJsonDependencies(packageJson, includeDevDependencies)).length
}

export async function processBatch(
  packageJson: PackageJsonInput,
  includeDevDependencies: boolean,
  onResult?: (result: AnalyzerResult) => void,
  signal?: AbortSignal,
): Promise<AnalyzerResult[]> {
  const dependencies = mergePackageJsonDependencies(packageJson, includeDevDependencies)
  const entries = Object.entries(dependencies)

  if (entries.length === 0) {
    return []
  }

  const advisories = await fetchBulkAdvisories(dependencies, signal)

  return withConcurrency(
    entries,
    ANALYSIS_CONCURRENCY,
    ([name, range]) => analyzePackage(name, range, advisories, signal),
    onResult ? (result) => onResult(result) : undefined,
    signal,
    ([name]): AnalyzerResult => ({
      status: 'error',
      name,
      currentVersion: null,
      error: 'Cancelled',
    }),
  )
}
