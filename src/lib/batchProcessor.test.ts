// @vitest-environment node
import type { AnalyzerResult, PackageJsonInput } from '@/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzePackage } from '@/lib/analyzer'
import { processBatch, withConcurrency } from '@/lib/batchProcessor'
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
    expect(mockAnalyzePackage).toHaveBeenCalledWith('react', '^18.2.0', [])
  })

  it('merges devDependencies when includeDevDependencies is true', async () => {
    const packageJson: PackageJsonInput = {
      dependencies: { react: '^18.2.0' },
      devDependencies: { vitest: '^3.0.0' },
    }
    await processBatch(packageJson, true)

    expect(mockAnalyzePackage).toHaveBeenCalledTimes(2)
    expect(mockAnalyzePackage).toHaveBeenCalledWith('react', '^18.2.0', [])
    expect(mockAnalyzePackage).toHaveBeenCalledWith('vitest', '^3.0.0', [])
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
})
