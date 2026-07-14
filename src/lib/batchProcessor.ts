import type { AnalyzerResult, PackageJsonInput } from '@/types'

import { analyzePackage } from '@/lib/analyzer'
import { fetchBulkAdvisories } from '@/lib/npmRegistry'

export function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  onItemDone?: (result: R, index: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function runWorker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      const item = items[index] as T

      results[index] = await worker(item)
      onItemDone?.(results[index] as R, index)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runWorker)

  return Promise.all(workers).then(() => results)
}

function mergeDependencies(
  packageJson: PackageJsonInput,
  includeDevDependencies: boolean,
): Record<string, string> {
  return {
    ...packageJson.dependencies,
    ...(includeDevDependencies ? packageJson.devDependencies : {}),
  }
}

export function countDependencies(
  packageJson: PackageJsonInput,
  includeDevDependencies: boolean,
): number {
  return Object.keys(mergeDependencies(packageJson, includeDevDependencies)).length
}

export async function processBatch(
  packageJson: PackageJsonInput,
  includeDevDependencies: boolean,
  onResult?: (result: AnalyzerResult) => void,
): Promise<AnalyzerResult[]> {
  const dependencies = mergeDependencies(packageJson, includeDevDependencies)
  const entries = Object.entries(dependencies)

  if (entries.length === 0) {
    return []
  }

  const advisories = await fetchBulkAdvisories(dependencies)

  return withConcurrency(
    entries,
    3,
    ([name, range]) => analyzePackage(name, range, advisories),
    onResult ? (result) => onResult(result) : undefined,
  )
}
