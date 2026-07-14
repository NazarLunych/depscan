// @vitest-environment node
import type { PackageState } from '@/types'
import { describe, expect, it } from 'vitest'

import { getPackageCardStyle } from '@/components/PackageCard/highlightStyles'

const basePackage: PackageState = {
  name: 'react',
  currentVersion: '^18.2.0',
  status: 'pending',
  analysis: null,
  error: null,
}

describe('getPackageCardStyle', () => {
  it('returns the pending style for a queued package', () => {
    expect(getPackageCardStyle(basePackage).badgeLabel).toBe('Queued')
  })

  it('returns the analyzing style while in flight', () => {
    expect(getPackageCardStyle({ ...basePackage, status: 'analyzing' }).badgeLabel).toBe(
      'Analyzing…',
    )
  })

  it('returns the error style for a failed package', () => {
    expect(
      getPackageCardStyle({ ...basePackage, status: 'error', error: 'boom' }).badgeLabel,
    ).toBe('Error')
  })

  it('maps a red highlight to the critical style', () => {
    const style = getPackageCardStyle({
      ...basePackage,
      status: 'done',
      analysis: {
        package: 'react',
        current_version: '17.0.2',
        target_version: '18.2.0',
        breaking_changes: [],
        migration_steps: [],
        security_risks: 'critical',
        roi: 'high',
        highlight: 'red',
      },
    })

    expect(style.badgeLabel).toBe('Upgrade required')
    expect(style.borderClass).toContain('red')
  })

  it('maps a none highlight to the neutral style', () => {
    const style = getPackageCardStyle({
      ...basePackage,
      status: 'done',
      analysis: {
        package: 'react',
        current_version: '18.2.0',
        target_version: '18.2.0',
        breaking_changes: [],
        migration_steps: [],
        security_risks: 'none',
        roi: 'low',
        highlight: 'none',
      },
    })

    expect(style.badgeLabel).toBe('Up to date')
  })
})
