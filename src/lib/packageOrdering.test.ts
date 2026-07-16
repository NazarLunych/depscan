// @vitest-environment node
import type { PackageAnalysis, PackageState } from '@/types'
import { describe, expect, it } from 'vitest'

import {
  deriveVisibleOrder,
  filterOrder,
  parseHighlightFilter,
  parseSortMode,
  sortOrder,
} from '@/lib/packageOrdering'

const analysis = (overrides: Partial<PackageAnalysis> = {}): PackageAnalysis => ({
  package: 'pkg',
  current_version: '1.0.0',
  target_version: '2.0.0',
  breaking_changes: [],
  migration_steps: [],
  security_risks: 'none',
  roi: 'low',
  highlight: 'none',
  ...overrides,
})

const donePackage = (name: string, overrides: Partial<PackageAnalysis> = {}): PackageState => ({
  name,
  currentVersion: '1.0.0',
  status: 'done',
  analysis: analysis({ package: name, ...overrides }),
  error: null,
})

const pendingPackage = (name: string): PackageState => ({
  name,
  currentVersion: '^1.0.0',
  status: 'pending',
  analysis: null,
  error: null,
})

describe('filterOrder', () => {
  it('returns the same order for filter "all"', () => {
    const order = ['a', 'b']
    const packages = { a: donePackage('a', { highlight: 'red' }), b: donePackage('b') }

    expect(filterOrder(order, packages, 'all')).toBe(order)
  })

  it('keeps only packages matching the highlight filter', () => {
    const order = ['red-pkg', 'yellow-pkg', 'none-pkg']
    const packages = {
      'red-pkg': donePackage('red-pkg', { highlight: 'red' }),
      'yellow-pkg': donePackage('yellow-pkg', { highlight: 'yellow' }),
      'none-pkg': donePackage('none-pkg', { highlight: 'none' }),
    }

    expect(filterOrder(order, packages, 'red')).toEqual(['red-pkg'])
  })

  it('excludes packages that have not resolved to done', () => {
    const order = ['pending-pkg']
    const packages = { 'pending-pkg': pendingPackage('pending-pkg') }

    expect(filterOrder(order, packages, 'red')).toEqual([])
  })
})

describe('sortOrder', () => {
  it('returns the same order for sort "default"', () => {
    const order = ['a', 'b']
    const packages = { a: donePackage('a'), b: donePackage('b') }

    expect(sortOrder(order, packages, 'default')).toBe(order)
  })

  it('orders by ROI severity, high before middle before low', () => {
    const order = ['low-pkg', 'high-pkg', 'middle-pkg']
    const packages = {
      'low-pkg': donePackage('low-pkg', { roi: 'low' }),
      'high-pkg': donePackage('high-pkg', { roi: 'high' }),
      'middle-pkg': donePackage('middle-pkg', { roi: 'middle' }),
    }

    expect(sortOrder(order, packages, 'roi')).toEqual(['high-pkg', 'middle-pkg', 'low-pkg'])
  })

  it('orders by highlight severity, red before yellow before none', () => {
    const order = ['none-pkg', 'red-pkg', 'yellow-pkg']
    const packages = {
      'none-pkg': donePackage('none-pkg', { highlight: 'none' }),
      'red-pkg': donePackage('red-pkg', { highlight: 'red' }),
      'yellow-pkg': donePackage('yellow-pkg', { highlight: 'yellow' }),
    }

    expect(sortOrder(order, packages, 'highlight')).toEqual(['red-pkg', 'yellow-pkg', 'none-pkg'])
  })

  it('keeps relative insertion order for equal severities (stable sort)', () => {
    const order = ['first', 'second', 'third']
    const packages = {
      first: donePackage('first', { roi: 'high' }),
      second: donePackage('second', { roi: 'high' }),
      third: donePackage('third', { roi: 'low' }),
    }

    expect(sortOrder(order, packages, 'roi')).toEqual(['first', 'second', 'third'])
  })

  it('sorts packages without a resolved ROI to the bottom', () => {
    const order = ['pending-pkg', 'high-pkg']
    const packages = {
      'pending-pkg': pendingPackage('pending-pkg'),
      'high-pkg': donePackage('high-pkg', { roi: 'high' }),
    }

    expect(sortOrder(order, packages, 'roi')).toEqual(['high-pkg', 'pending-pkg'])
  })
})

describe('deriveVisibleOrder', () => {
  it('composes filtering and sorting', () => {
    const order = ['low-red', 'high-red', 'high-yellow']
    const packages = {
      'low-red': donePackage('low-red', { highlight: 'red', roi: 'low' }),
      'high-red': donePackage('high-red', { highlight: 'red', roi: 'high' }),
      'high-yellow': donePackage('high-yellow', { highlight: 'yellow', roi: 'high' }),
    }

    expect(deriveVisibleOrder(order, packages, 'red', 'roi')).toEqual(['high-red', 'low-red'])
  })
})

describe('parseHighlightFilter', () => {
  it('accepts known values', () => {
    expect(parseHighlightFilter('red')).toBe('red')
    expect(parseHighlightFilter('yellow')).toBe('yellow')
    expect(parseHighlightFilter('none')).toBe('none')
  })

  it('falls back to "all" for missing or unrecognized values', () => {
    expect(parseHighlightFilter(null)).toBe('all')
    expect(parseHighlightFilter('bogus')).toBe('all')
  })
})

describe('parseSortMode', () => {
  it('accepts known values', () => {
    expect(parseSortMode('roi')).toBe('roi')
    expect(parseSortMode('highlight')).toBe('highlight')
  })

  it('falls back to "default" for missing or unrecognized values', () => {
    expect(parseSortMode(null)).toBe('default')
    expect(parseSortMode('bogus')).toBe('default')
  })
})
