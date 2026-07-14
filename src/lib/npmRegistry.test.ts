// @vitest-environment node
import type { NpmPackument, Vulnerability } from '@/types'
import { describe, expect, it } from 'vitest'

import { filterRelevantAdvisories, normalizeDeprecated, resolveCurrentVersion } from '@/lib/npmRegistry'

const makePackument = (versions: string[], latest: string, name = 'test-pkg'): NpmPackument => ({
  name,
  'dist-tags': { latest },
  versions: Object.fromEntries(
    versions.map((v) => [v, { version: v }]),
  ) as NpmPackument['versions'],
})

const basePackument = makePackument(['1.0.0', '1.2.3', '2.0.0', '2.1.0'], '2.1.0')

const makeAdvisory = (affectedRange: string, id = 'GHSA-test'): Vulnerability => ({
  id,
  packageName: 'test-pkg',
  title: 'Test advisory',
  severity: 'high',
  affectedRange,
  cveId: null,
})

describe('resolveCurrentVersion', () => {
  it('resolves ^range to max satisfying', () => {
    expect(resolveCurrentVersion('^1.0.0', basePackument)).toBe('1.2.3')
  })

  it('resolves ~range to max satisfying', () => {
    expect(resolveCurrentVersion('~1.2.0', basePackument)).toBe('1.2.3')
  })

  it('resolves >=...< range', () => {
    expect(resolveCurrentVersion('>=1.0.0 <2.0.0', basePackument)).toBe('1.2.3')
  })

  it('resolves exact version', () => {
    expect(resolveCurrentVersion('1.0.0', basePackument)).toBe('1.0.0')
  })

  it('resolves "latest" to dist-tags.latest', () => {
    expect(resolveCurrentVersion('latest', basePackument)).toBe('2.1.0')
  })

  it('resolves "*" to dist-tags.latest', () => {
    expect(resolveCurrentVersion('*', basePackument)).toBe('2.1.0')
  })

  it('throws when no version satisfies range', () => {
    expect(() => resolveCurrentVersion('^3.0.0', basePackument)).toThrow(
      'no version satisfies range "^3.0.0"',
    )
  })

  it('throws for workspace: protocol', () => {
    expect(() => resolveCurrentVersion('workspace:^', basePackument)).toThrow(
      'workspace protocol not supported',
    )
  })

  it('throws for workspace:* protocol', () => {
    expect(() => resolveCurrentVersion('workspace:*', basePackument)).toThrow(
      'workspace protocol not supported',
    )
  })

  it('throws for npm: alias', () => {
    expect(() => resolveCurrentVersion('npm:lodash@^4', basePackument)).toThrow(
      'npm alias not supported',
    )
  })

  it('throws for git:// dependency', () => {
    expect(() => resolveCurrentVersion('git://github.com/user/repo', basePackument)).toThrow(
      'git dependency not supported',
    )
  })

  it('throws for git+ dependency', () => {
    expect(() =>
      resolveCurrentVersion('git+https://github.com/user/repo.git', basePackument),
    ).toThrow('git dependency not supported')
  })

  it('throws for https:// URL dependency', () => {
    expect(() => resolveCurrentVersion('https://example.com/pkg.tgz', basePackument)).toThrow(
      'URL dependency not supported',
    )
  })

  it('works correctly for scoped packages', () => {
    const scoped = makePackument(['1.0.0', '1.5.0'], '1.5.0', '@scope/pkg')
    expect(resolveCurrentVersion('^1.0.0', scoped)).toBe('1.5.0')
  })
})

describe('filterRelevantAdvisories', () => {
  const currentVersion = '1.5.0'
  const latestVersion = '2.0.0'

  it('includes advisory where current is affected and latest escapes', () => {
    const advisories = [makeAdvisory('>=1.0.0 <2.0.0')]
    expect(filterRelevantAdvisories(advisories, currentVersion, latestVersion)).toHaveLength(1)
  })

  it.each([
    ['latest is still in range', '>=1.0.0 <3.0.0'],
    ['current is not affected (range below)', '>=2.0.0'],
    ['current is not affected (range above)', '<1.0.0'],
    ['wildcard range (*)', '*'],
    ['invalid affectedRange (does not throw)', 'invalid-range!!!'],
  ])('excludes advisory where %s', (_description, affectedRange) => {
    const advisories = [makeAdvisory(affectedRange)]
    expect(filterRelevantAdvisories(advisories, currentVersion, latestVersion)).toHaveLength(0)
  })

  it('returns empty array when input is empty', () => {
    expect(filterRelevantAdvisories([], currentVersion, latestVersion)).toEqual([])
  })

  it('filters correctly from a mixed list', () => {
    const advisories = [
      makeAdvisory('>=1.0.0 <2.0.0', 'GHSA-001'), // ✅ included
      makeAdvisory('>=1.0.0 <3.0.0', 'GHSA-002'), // ❌ latest still affected
      makeAdvisory('>=2.0.0', 'GHSA-003'), // ❌ current not affected
      makeAdvisory('>=1.0.0 <2.0.0', 'GHSA-004'), // ✅ included
    ]
    const result = filterRelevantAdvisories(advisories, currentVersion, latestVersion)

    expect(result).toHaveLength(2)
    expect(result.map((a) => a.id)).toEqual(['GHSA-001', 'GHSA-004'])
  })
})

describe('normalizeDeprecated', () => {
  it('returns the string as-is when given a reason', () => {
    expect(normalizeDeprecated('use something else')).toBe('use something else')
  })

  it('returns a fallback message when given `true` (npm registry boolean quirk)', () => {
    expect(normalizeDeprecated(true)).toBe('deprecated')
  })

  it('returns null when given `false`', () => {
    expect(normalizeDeprecated(false)).toBeNull()
  })

  it('returns null when given undefined', () => {
    expect(normalizeDeprecated(undefined)).toBeNull()
  })
})
