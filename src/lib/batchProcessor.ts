import type { AnalyzerResult, PackageJsonInput } from '@/types'

import { analyzePackage } from '@/lib/analyzer'
import { fetchBulkAdvisories } from '@/lib/npmRegistry'

export function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function runWorker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      const item = items[index] as T

      results[index] = await worker(item)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runWorker)

  return Promise.all(workers).then(() => results)
}

export async function processBatch(
  packageJson: PackageJsonInput,
  includeDevDependencies: boolean,
): Promise<AnalyzerResult[]> {
  const dependencies = {
    ...packageJson.dependencies,
    ...(includeDevDependencies ? packageJson.devDependencies : {}),
  }
  const entries = Object.entries(dependencies)

  if (entries.length === 0) {
    return []
  }

  const advisories = await fetchBulkAdvisories(dependencies)

  return withConcurrency(entries, 3, ([name, range]) => analyzePackage(name, range, advisories))
}
