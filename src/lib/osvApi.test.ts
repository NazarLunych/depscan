// @vitest-environment node
import type { OsvVulnerability, Vulnerability } from '@/types'
import { describe, expect, it } from 'vitest'

import { mergeVulnerabilities, normalizeOsvVulnerability } from '@/lib/osvApi'

const makeOsv = (overrides: Partial<OsvVulnerability> = {}): OsvVulnerability => ({
  id: 'GHSA-test-0000',
  summary: 'Test vulnerability',
  severity: [{ type: 'CVSS_V3', score: '9.8' }],
  affected: [
    {
      ranges: [
        {
          type: 'SEMVER',
          events: [{ introduced: '1.0.0' }, { fixed: '2.0.0' }],
        },
      ],
    },
  ],
  references: [{ type: 'ADVISORY', url: 'https://example.com/advisory' }],
  ...overrides,
})
const makeVuln = (overrides: Partial<Vulnerability> = {}): Vulnerability => ({
  id: 'GHSA-default',
  title: 'Default vuln',
  severity: 'medium',
  affectedRange: '>=1.0.0 <2.0.0',
  ...overrides,
})

describe('normalizeOsvVulnerability', () => {
  it('maps critical CVSS score (9.8)', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ severity: [{ type: 'CVSS_V3', score: '9.8' }] }),
    )
    expect(result.severity).toBe('critical')
  })

  it('maps high CVSS score (7.5)', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ severity: [{ type: 'CVSS_V3', score: '7.5' }] }),
    )
    expect(result.severity).toBe('high')
  })

  it('maps medium CVSS score (5.0)', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ severity: [{ type: 'CVSS_V3', score: '5.0' }] }),
    )
    expect(result.severity).toBe('medium')
  })

  it('maps low CVSS score (2.1)', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ severity: [{ type: 'CVSS_V3', score: '2.1' }] }),
    )
    expect(result.severity).toBe('low')
  })

  it('maps CVSS vector string (non-numeric) to low', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({
        severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
      }),
    )
    expect(result.severity).toBe('low')
  })

  it('maps introduced + fixed to correct affectedRange', () => {
    const result = normalizeOsvVulnerability(makeOsv())
    expect(result.affectedRange).toBe('>= 1.0.0 < 2.0.0')
    expect(result.fixedIn).toBe('2.0.0')
  })

  it('maps introduced=0 + fixed to "< <fixed>"', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({
        affected: [
          {
            ranges: [
              {
                type: 'SEMVER',
                events: [{ introduced: '0' }, { fixed: '1.5.0' }],
              },
            ],
          },
        ],
      }),
    )
    expect(result.affectedRange).toBe('< 1.5.0')
    expect(result.fixedIn).toBe('1.5.0')
  })

  it('maps introduced only (no fixed) to ">= <introduced>"', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({
        affected: [
          {
            ranges: [
              {
                type: 'SEMVER',
                events: [{ introduced: '3.0.0' }],
              },
            ],
          },
        ],
      }),
    )
    expect(result.affectedRange).toBe('>= 3.0.0')
    expect(result.fixedIn).toBeUndefined()
  })

  it('maps missing all optional fields to safe defaults', () => {
    const result = normalizeOsvVulnerability({ id: 'GHSA-bare' })
    expect(result.id).toBe('GHSA-bare')
    expect(result.title).toBe('GHSA-bare')
    expect(result.severity).toBe('low')
    expect(result.affectedRange).toBe('*')
    expect(result.fixedIn).toBeUndefined()
    expect(result.url).toBeUndefined()
  })

  it('uses summary as title when present', () => {
    const result = normalizeOsvVulnerability(makeOsv({ summary: 'SQL injection' }))
    expect(result.title).toBe('SQL injection')
  })

  it('falls back to id as title when summary is missing', () => {
    const result = normalizeOsvVulnerability(makeOsv({ id: 'GHSA-xyz', summary: undefined }))
    expect(result.title).toBe('GHSA-xyz')
  })

  it('sets url from first reference', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ references: [{ type: 'ADVISORY', url: 'https://example.com' }] }),
    )
    expect(result.url).toBe('https://example.com')
  })

  it('sets url to undefined when no references', () => {
    const result = normalizeOsvVulnerability(makeOsv({ references: [] }))
    expect(result.url).toBeUndefined()
  })
})

describe('mergeVulnerabilities', () => {
  it('returns both when no overlap', () => {
    const npm = [makeVuln({ id: 'A' })]
    const osv = [makeVuln({ id: 'B' })]
    const result = mergeVulnerabilities(npm, osv)
    expect(result).toHaveLength(2)
    expect(result.map((v) => v.id)).toContain('A')
    expect(result.map((v) => v.id)).toContain('B')
  })

  it('npm wins on collision by id', () => {
    const npm = [makeVuln({ id: 'X', title: 'npm version' })]
    const osv = [makeVuln({ id: 'X', title: 'osv version' })]
    const result = mergeVulnerabilities(npm, osv)
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('npm version')
  })

  it('returns osv list when npm is empty', () => {
    const osv = [makeVuln({ id: 'A' }), makeVuln({ id: 'B' })]
    const result = mergeVulnerabilities([], osv)
    expect(result).toHaveLength(2)
  })

  it('returns npm list when osv is empty', () => {
    const npm = [makeVuln({ id: 'A' }), makeVuln({ id: 'B' })]
    const result = mergeVulnerabilities(npm, [])
    expect(result).toHaveLength(2)
  })

  it('returns empty array when both are empty', () => {
    expect(mergeVulnerabilities([], [])).toEqual([])
  })

  it('deduplicates with all unique IDs preserved', () => {
    const npm = [makeVuln({ id: 'A' }), makeVuln({ id: 'B', title: 'npm-B' })]
    const osv = [makeVuln({ id: 'B', title: 'osv-B' }), makeVuln({ id: 'C' })]
    const result = mergeVulnerabilities(npm, osv)
    expect(result).toHaveLength(3)

    const byId = Object.fromEntries(result.map((v) => [v.id, v]))
    expect(byId['B']?.title).toBe('npm-B')
  })
})
