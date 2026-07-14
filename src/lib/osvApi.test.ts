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
  packageName: 'test-pkg',
  title: 'Default vuln',
  severity: 'medium',
  affectedRange: '>=1.0.0 <2.0.0',
  cveId: null,
  ...overrides,
})

describe('normalizeOsvVulnerability', () => {
  it('maps critical CVSS score (9.8)', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ severity: [{ type: 'CVSS_V3', score: '9.8' }] }),
      'test-pkg',
    )
    expect(result.severity).toBe('critical')
  })

  it('maps high CVSS score (7.5)', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ severity: [{ type: 'CVSS_V3', score: '7.5' }] }),
      'test-pkg',
    )
    expect(result.severity).toBe('high')
  })

  it('maps medium CVSS score (5.0)', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ severity: [{ type: 'CVSS_V3', score: '5.0' }] }),
      'test-pkg',
    )
    expect(result.severity).toBe('medium')
  })

  it('maps low CVSS score (2.1)', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ severity: [{ type: 'CVSS_V3', score: '2.1' }] }),
      'test-pkg',
    )
    expect(result.severity).toBe('low')
  })

  it('reads severity from database_specific bucket (real OSV shape)', () => {
    // OSV/GitHub give a ready-made bucket here; severity[].score is a CVSS
    // vector string that parseFloat can't turn into a number.
    const result = normalizeOsvVulnerability(
      makeOsv({
        database_specific: { severity: 'CRITICAL' },
        severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
      }),
      'test-pkg',
    )
    expect(result.severity).toBe('critical')
  })

  it('maps MODERATE bucket to medium', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ database_specific: { severity: 'MODERATE' }, severity: undefined }),
      'test-pkg',
    )
    expect(result.severity).toBe('medium')
  })

  it('falls back to low when only a CVSS vector string is present (no bucket)', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({
        database_specific: undefined,
        severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
      }),
      'test-pkg',
    )
    expect(result.severity).toBe('low')
  })

  it('maps introduced + fixed to correct affectedRange', () => {
    const result = normalizeOsvVulnerability(makeOsv(), 'test-pkg')
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
      'test-pkg',
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
      'test-pkg',
    )
    expect(result.affectedRange).toBe('>= 3.0.0')
    expect(result.fixedIn).toBeUndefined()
  })

  it('maps missing all optional fields to safe defaults', () => {
    const result = normalizeOsvVulnerability({ id: 'GHSA-bare' }, 'test-pkg')
    expect(result.id).toBe('GHSA-bare')
    expect(result.title).toBe('GHSA-bare')
    expect(result.severity).toBe('low')
    expect(result.affectedRange).toBe('*')
    expect(result.fixedIn).toBeUndefined()
    expect(result.url).toBeUndefined()
  })

  it('uses summary as title when present', () => {
    const result = normalizeOsvVulnerability(makeOsv({ summary: 'SQL injection' }), 'test-pkg')
    expect(result.title).toBe('SQL injection')
  })

  it('falls back to id as title when summary is missing', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ id: 'GHSA-xyz', summary: undefined }),
      'test-pkg',
    )
    expect(result.title).toBe('GHSA-xyz')
  })

  it('sets url from first reference', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ references: [{ type: 'ADVISORY', url: 'https://example.com' }] }),
      'test-pkg',
    )
    expect(result.url).toBe('https://example.com')
  })

  it('sets url to undefined when no references', () => {
    const result = normalizeOsvVulnerability(makeOsv({ references: [] }), 'test-pkg')
    expect(result.url).toBeUndefined()
  })

  it('extracts cveId from aliases', () => {
    const result = normalizeOsvVulnerability(
      makeOsv({ aliases: ['CVE-2026-2950'] }),
      'test-pkg',
    )
    expect(result.cveId).toBe('CVE-2026-2950')
  })

  it('sets cveId to null when aliases has no CVE entry', () => {
    const result = normalizeOsvVulnerability(makeOsv({ aliases: ['GHSA-other-id'] }), 'test-pkg')
    expect(result.cveId).toBeNull()
  })

  it('sets cveId to null when aliases is missing', () => {
    const result = normalizeOsvVulnerability(makeOsv({ aliases: undefined }), 'test-pkg')
    expect(result.cveId).toBeNull()
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

  it('collapses the same advisory arriving as a numeric npm id and a GHSA osv id', () => {
    // npm advisory: numeric id, GHSA in the url. OSV: GHSA as the id itself.
    const npm = [
      makeVuln({
        id: '1096846',
        title: 'npm version',
        url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
      }),
    ]
    const osv = [makeVuln({ id: 'GHSA-35jh-r3h4-6jhm', title: 'osv version' })]
    const result = mergeVulnerabilities(npm, osv)

    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('npm version')
  })

  it('links npm and osv records that share a CVE identifier in both ids', () => {
    // Both sources key off the same CVE — collapses to one.
    const npm = [makeVuln({ id: 'CVE-2021-23337', title: 'npm-cve' })]
    const osv = [
      makeVuln({
        id: 'CVE-2021-23337',
        title: 'osv-cve',
        url: 'https://osv.dev/vulnerability/CVE-2021-23337',
      }),
    ]
    const result = mergeVulnerabilities(npm, osv)

    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('npm-cve')
  })

  it('keeps distinct advisories with no shared GHSA/CVE identifier', () => {
    const npm = [makeVuln({ id: '111', url: 'https://github.com/advisories/GHSA-aaaa-aaaa-aaaa' })]
    const osv = [makeVuln({ id: 'GHSA-bbbb-bbbb-bbbb' })]
    const result = mergeVulnerabilities(npm, osv)

    expect(result).toHaveLength(2)
  })

  it('recovers cveId from the matching OSV record when npm has none', () => {
    // npm advisories never carry a CVE id on their own.
    const npm = [
      makeVuln({
        id: '1115810',
        title: 'npm version',
        url: 'https://github.com/advisories/GHSA-f23m-r3pf-42rh',
        cveId: null,
      }),
    ]
    const osv = [
      makeVuln({ id: 'GHSA-f23m-r3pf-42rh', title: 'osv version', cveId: 'CVE-2026-2950' }),
    ]
    const result = mergeVulnerabilities(npm, osv)

    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('npm version')
    expect(result[0]?.cveId).toBe('CVE-2026-2950')
  })

  it("keeps npm's own cveId when it already has one", () => {
    const npm = [makeVuln({ id: 'X', title: 'npm version', cveId: 'CVE-1111-1111' })]
    const osv = [makeVuln({ id: 'X', title: 'osv version', cveId: 'CVE-2222-2222' })]
    const result = mergeVulnerabilities(npm, osv)

    expect(result[0]?.cveId).toBe('CVE-1111-1111')
  })
})
