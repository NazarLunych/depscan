// @vitest-environment node
import type { PackageAnalysis } from '@/types'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAnalysisStore } from '@/stores/analysisStore'

const analysis = (overrides: Partial<PackageAnalysis> = {}): PackageAnalysis => ({
  package: 'react',
  current_version: '18.2.0',
  target_version: '19.0.0',
  breaking_changes: [],
  migration_steps: [],
  security_risks: 'none',
  roi: 'low',
  highlight: 'none',
  ...overrides,
})

describe('analysisStore', () => {
  beforeEach(() => {
    useAnalysisStore.getState().reset()
  })

  it('initPackages sets pending packages, order and summary', () => {
    useAnalysisStore
      .getState()
      .initPackages([{ name: 'react', versionRange: '^18.2.0' }], 1)

    const state = useAnalysisStore.getState()

    expect(state.order).toEqual(['react'])
    expect(state.packages.react).toEqual({
      name: 'react',
      currentVersion: '^18.2.0',
      status: 'pending',
      analysis: null,
      error: null,
    })
    expect(state.summary).toEqual({ total: 1, done: 0, failed: 0, critical: 0 })
    expect(state.isRunning).toBe(true)
  })

  it('markAnalyzing transitions a package to analyzing', () => {
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }], 1)
    useAnalysisStore.getState().markAnalyzing('react')

    expect(useAnalysisStore.getState().packages.react?.status).toBe('analyzing')
  })

  it('markDone stores the analysis, resolves the concrete version, and increments summary', () => {
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }], 1)
    useAnalysisStore.getState().markDone('react', analysis({ highlight: 'red' }))

    const state = useAnalysisStore.getState()

    expect(state.packages.react?.status).toBe('done')
    expect(state.packages.react?.currentVersion).toBe('18.2.0')
    expect(state.packages.react?.analysis?.highlight).toBe('red')
    expect(state.summary).toEqual({ total: 1, done: 1, failed: 0, critical: 1 })
  })

  it('markDone does not count critical for a non-red highlight', () => {
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }], 1)
    useAnalysisStore.getState().markDone('react', analysis({ highlight: 'yellow' }))

    expect(useAnalysisStore.getState().summary.critical).toBe(0)
  })

  it('markError stores the error message and increments failed', () => {
    useAnalysisStore.getState().initPackages([{ name: 'left-pad', versionRange: '^1.0.0' }], 1)
    useAnalysisStore.getState().markError('left-pad', 'registry 404')

    const state = useAnalysisStore.getState()

    expect(state.packages['left-pad']?.status).toBe('error')
    expect(state.packages['left-pad']?.error).toBe('registry 404')
    expect(state.summary.failed).toBe(1)
  })

  it('ignores mark* calls for an unknown package name', () => {
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }], 1)
    useAnalysisStore.getState().markDone('unknown', analysis())

    expect(useAnalysisStore.getState().packages.unknown).toBeUndefined()
  })

  it('setFatalError records the message and stops isRunning', () => {
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }], 1)
    useAnalysisStore.getState().setFatalError('stream failed')

    const state = useAnalysisStore.getState()

    expect(state.fatalError).toBe('stream failed')
    expect(state.isRunning).toBe(false)
  })

  it('finish sets the final summary totals and stops isRunning', () => {
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }], 1)
    useAnalysisStore.getState().markDone('react', analysis())
    useAnalysisStore.getState().finish({ total: 1, failed: 0 })

    const state = useAnalysisStore.getState()

    expect(state.isRunning).toBe(false)
    expect(state.summary.total).toBe(1)
    expect(state.summary.failed).toBe(0)
  })

  it('reset clears all state back to initial', () => {
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }], 1)
    useAnalysisStore.getState().markDone('react', analysis())
    useAnalysisStore.getState().reset()

    const state = useAnalysisStore.getState()

    expect(state.order).toEqual([])
    expect(state.packages).toEqual({})
    expect(state.summary).toEqual({ total: 0, done: 0, failed: 0, critical: 0 })
    expect(state.isRunning).toBe(false)
    expect(state.fatalError).toBeNull()
  })
})
