// @vitest-environment node
import type { AnalyzerResult, PackageJsonInput } from '@/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzePackage } from '@/lib/analyzer'
import { countDependencies, processBatch, withConcurrency } from '@/lib/batchProcessor'
import { fetchBulkAdvisories } from '@/lib/npmRegistry'

vi.mock('@/lib/analyzer', () => ({
  analyzePackage: vi.fn(),
}))

vi.mock('@/lib/npmRegistry', () => ({
  fetchBulkAdvisories: vi.fn(),
}))

const mockAnalyzePackage = vi.mocked(analyzePackage)
const mockFetchBulkAdvisories = vi.mocked(fetchBulkAdvisories)

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('withConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    const items = [30, 10, 20]
    const result = await withConcurrency(items, 3, async (ms) => {
      await delay(ms)

      return ms
    })

    expect(result).toEqual([30, 10, 20])
  })

  it('never runs more than `concurrency` workers at once', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const items = [1, 2, 3, 4, 5, 6, 7, 8]

    await withConcurrency(items, 3, async (item) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await delay(5)
      inFlight--

      return item
    })

    expect(maxInFlight).toBeLessThanOrEqual(3)
  })

  it('handles an empty items array', async () => {
    const result = await withConcurrency<number, number>([], 3, async (item) => item)
    expect(result).toEqual([])
  })

  it('propagates a worker rejection', async () => {
    await expect(
      withConcurrency([1, 2], 2, async () => {
        throw new Error('worker failed')
      }),
    ).rejects.toThrow('worker failed')
  })

  it('calls onItemDone once per item with the result and index', async () => {
    const items = [10, 20, 30]
    const done: Array<{ result: number; index: number }> = []

    await withConcurrency(
      items,
      3,
      async (item) => item * 2,
      (result, index) => {
        done.push({ result, index })
      },
    )

    expect(done).toHaveLength(3)
    expect(done.sort((a, b) => a.index - b.index)).toEqual([
      { result: 20, index: 0 },
      { result: 40, index: 1 },
      { result: 60, index: 2 },
    ])
  })

  it('does not start new workers once the signal is already aborted', async () => {
    const controller = new AbortController()

    controller.abort()

    const worker = vi.fn(async (item: number) => item)

    await withConcurrency([1, 2, 3], 2, worker, undefined, controller.signal)

    expect(worker).not.toHaveBeenCalled()
  })

  it('fills unclaimed indices via onSkipped when the signal aborts mid-batch', async () => {
    const controller = new AbortController()
    const items = [1, 2, 3, 4, 5]
    const result = await withConcurrency(
      items,
      1,
      async (item) => {
        if (item === 2) {
          controller.abort()
        }

        return item * 10
      },
      undefined,
      controller.signal,
      (item) => -item,
    )

    expect(result).toEqual([10, 20, -3, -4, -5])
  })

  it('leaves unclaimed indices undefined when no onSkipped is given', async () => {
    const controller = new AbortController()
    const items = [1, 2, 3]
    const result = await withConcurrency(
      items,
      1,
      async (item) => {
        if (item === 1) {
          controller.abort()
        }

        return item * 10
      },
      undefined,
      controller.signal,
    )

    expect(result).toEqual([10, undefined, undefined])
  })

  it('calls onItemDone progressively, not only after all workers finish', async () => {
    const callOrder: string[] = []
    const items = [30, 10]

    await withConcurrency(
      items,
      2,
      async (ms) => {
        await delay(ms)

        return ms
      },
      (result) => {
        callOrder.push(`done:${result}`)
      },
    )

    expect(callOrder).toEqual(['done:10', 'done:30'])
  })
})

describe('countDependencies', () => {
  it('counts only dependencies when includeDevDependencies is false', () => {
    const packageJson: PackageJsonInput = {
      dependencies: { react: '^18.2.0', lodash: '^4.17.21' },
      devDependencies: { vitest: '^3.0.0' },
    }

    expect(countDependencies(packageJson, false)).toBe(2)
  })

  it('counts merged dependencies when includeDevDependencies is true', () => {
    const packageJson: PackageJsonInput = {
      dependencies: { react: '^18.2.0' },
      devDependencies: { vitest: '^3.0.0' },
    }

    expect(countDependencies(packageJson, true)).toBe(2)
  })

  it('returns 0 for an empty package.json', () => {
    expect(countDependencies({}, true)).toBe(0)
  })
})

describe('processBatch', () => {
  const doneResult = (name: string): AnalyzerResult => ({
    status: 'done',
    name,
    currentVersion: '1.0.0',
    analysis: {
      package: name,
      current_version: '1.0.0',
      target_version: '2.0.0',
      breaking_changes: [],
      migration_steps: [],
      security_risks: 'none',
      roi: 'low',
      highlight: 'none',
    },
  })

  beforeEach(() => {
    mockAnalyzePackage.mockReset()
    mockFetchBulkAdvisories.mockReset()
    mockFetchBulkAdvisories.mockResolvedValue([])
    mockAnalyzePackage.mockImplementation(async (name) => doneResult(name))
  })

  it('returns [] and skips fetchBulkAdvisories for an empty package.json', async () => {
    const packageJson: PackageJsonInput = {}
    const result = await processBatch(packageJson, false)

    expect(result).toEqual([])
    expect(mockFetchBulkAdvisories).not.toHaveBeenCalled()
    expect(mockAnalyzePackage).not.toHaveBeenCalled()
  })

  it('analyzes only dependencies when includeDevDependencies is false', async () => {
    const packageJson: PackageJsonInput = {
      dependencies: { react: '^18.2.0' },
      devDependencies: { vitest: '^3.0.0' },
    }
    await processBatch(packageJson, false)

    expect(mockAnalyzePackage).toHaveBeenCalledTimes(1)
    expect(mockAnalyzePackage).toHaveBeenCalledWith('react', '^18.2.0', [], undefined)
  })

  it('merges devDependencies when includeDevDependencies is true', async () => {
    const packageJson: PackageJsonInput = {
      dependencies: { react: '^18.2.0' },
      devDependencies: { vitest: '^3.0.0' },
    }
    await processBatch(packageJson, true)

    expect(mockAnalyzePackage).toHaveBeenCalledTimes(2)
    expect(mockAnalyzePackage).toHaveBeenCalledWith('react', '^18.2.0', [], undefined)
    expect(mockAnalyzePackage).toHaveBeenCalledWith('vitest', '^3.0.0', [], undefined)
  })

  it('calls fetchBulkAdvisories exactly once regardless of package count', async () => {
    const packageJson: PackageJsonInput = {
      dependencies: { react: '^18.2.0', lodash: '^4.17.21', axios: '^1.6.0' },
    }
    await processBatch(packageJson, false)

    expect(mockFetchBulkAdvisories).toHaveBeenCalledTimes(1)
  })

  it('returns one AnalyzerResult per package', async () => {
    const packageJson: PackageJsonInput = {
      dependencies: { react: '^18.2.0', lodash: '^4.17.21' },
    }
    const result = await processBatch(packageJson, false)

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.name).sort()).toEqual(['lodash', 'react'])
  })

  it('calls onResult once per package as it completes', async () => {
    const packageJson: PackageJsonInput = {
      dependencies: { react: '^18.2.0', lodash: '^4.17.21' },
    }
    const onResult = vi.fn()

    await processBatch(packageJson, false, onResult)

    expect(onResult).toHaveBeenCalledTimes(2)
    expect(onResult.mock.calls.map(([result]) => result.name).sort()).toEqual(['lodash', 'react'])
  })

  it('reports unclaimed packages as Cancelled instead of leaving them undefined', async () => {
    const controller = new AbortController()
    const packageJson: PackageJsonInput = {
      dependencies: { react: '^18.2.0', lodash: '^4.17.21' },
    }

    mockAnalyzePackage.mockImplementation(async (name) => {
      controller.abort()

      return doneResult(name)
    })

    const result = await processBatch(packageJson, false, undefined, controller.signal)

    expect(result).toHaveLength(2)
    expect(
      result.every((r) => r.status === 'done' || (r.status === 'error' && r.error === 'Cancelled')),
    ).toBe(true)
    expect(result.some((r) => r.status === 'error' && r.error === 'Cancelled')).toBe(true)
  })
})
