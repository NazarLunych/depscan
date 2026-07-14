// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { extractRelevantSections, resolveChangelog } from '@/lib/changelogExtractor'
import { searchChangelog } from '@/lib/exaSearch'
import { fetchChangelogContents, fetchReleases, parseGitHubRepo } from '@/lib/githubReleases'

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('@/lib/githubReleases', () => ({
  parseGitHubRepo: vi.fn(),
  fetchReleases: vi.fn(),
  fetchChangelogContents: vi.fn(),
}))

vi.mock('@/lib/exaSearch', () => ({
  searchChangelog: vi.fn(),
}))

const mockParseGitHubRepo = vi.mocked(parseGitHubRepo)
const mockFetchReleases = vi.mocked(fetchReleases)
const mockFetchChangelogContents = vi.mocked(fetchChangelogContents)
const mockSearchChangelog = vi.mocked(searchChangelog)
// ─── extractRelevantSections ──────────────────────────────────────────────────
const SAMPLE_CHANGELOG = `
# Changelog

## 3.0.0 (2024-05-01)

Breaking: removed old API.

## 2.1.0 (2024-02-01)

Added new feature X.

## 2.0.0 (2024-01-01)

Major rewrite. Breaking changes in config.

## 1.5.0 (2023-10-01)

Minor improvements.

## 1.0.0 (2023-01-01)

Initial release.
`.trim()

describe('extractRelevantSections', () => {
  it('extracts sections within version range', () => {
    const result = extractRelevantSections(SAMPLE_CHANGELOG, '1.5.0', '2.1.0')
    expect(result).toContain('## 2.1.0')
    expect(result).toContain('## 2.0.0')
    expect(result).not.toContain('## 3.0.0')
    expect(result).not.toContain('## 1.5.0')
    expect(result).not.toContain('## 1.0.0')
  })

  it('excludes sections below fromVersion', () => {
    const result = extractRelevantSections(SAMPLE_CHANGELOG, '2.0.0', '3.0.0')
    expect(result).not.toContain('## 1.5.0')
    expect(result).not.toContain('## 1.0.0')
  })

  it('includes toVersion but excludes fromVersion (exclusive lower bound)', () => {
    // fromVersion is the current installed version — we only need what changed AFTER it
    const result = extractRelevantSections(SAMPLE_CHANGELOG, '2.0.0', '3.0.0')
    expect(result).toContain('## 3.0.0')
    expect(result).toContain('## 2.1.0')
    expect(result).not.toContain('## 2.0.0')
  })

  it('trims output to 8000 chars', () => {
    const bigText = Array.from({ length: 100 }, (_, i) => {
      const v = `${i + 1}.0.0`

      return `## ${v}\n\n${'x'.repeat(200)}`
    }).join('\n\n')
    const result = extractRelevantSections(bigText, '1.0.0', '100.0.0')
    expect(result.length).toBeLessThanOrEqual(8_000)
  })

  it('returns first 8000 chars when no version headers found', () => {
    const plain = 'No headers here just plain text.\n'.repeat(300)
    const result = extractRelevantSections(plain, '1.0.0', '2.0.0')
    expect(result.length).toBeLessThanOrEqual(8_000)
    expect(result).toBe(plain.slice(0, 8_000))
  })

  it('returns empty string for empty input', () => {
    expect(extractRelevantSections('', '1.0.0', '2.0.0')).toBe('')
  })

  it('handles ## [2.0.0] style headers', () => {
    const text = `## [3.0.0]\n\nNew feature.\n\n## [2.0.0]\n\nBreaking changes.\n\n## [1.0.0]\n\nInitial.`
    const result = extractRelevantSections(text, '1.0.0', '2.0.0')
    expect(result).toContain('## [2.0.0]')
    expect(result).not.toContain('## [1.0.0]')
    expect(result).not.toContain('## [3.0.0]')
  })

  it('handles # v2.0.0 style headers', () => {
    const text = `# v3.0.0\n\nLatest.\n\n# v2.0.0\n\nNew stuff.\n\n# v1.0.0\n\nOld stuff.`
    const result = extractRelevantSections(text, '1.0.0', '2.0.0')
    expect(result).toContain('# v2.0.0')
    expect(result).not.toContain('# v1.0.0')
    expect(result).not.toContain('# v3.0.0')
  })

  it('handles ## 2.0.0 (2024-01-15) style headers', () => {
    const text = `## 3.0.0 (2025-01-01)\n\nLatest.\n\n## 2.0.0 (2024-01-15)\n\nRelease notes.\n\n## 1.0.0 (2023-01-01)\n\nOld.`
    const result = extractRelevantSections(text, '1.0.0', '2.0.0')
    expect(result).toContain('2.0.0 (2024-01-15)')
    expect(result).not.toContain('1.0.0 (2023-01-01)')
    expect(result).not.toContain('3.0.0 (2025-01-01)')
  })
})

// ─── resolveChangelog ─────────────────────────────────────────────────────────

describe('resolveChangelog', () => {
  const REPO_URL = 'https://github.com/facebook/react'
  const REPO = { owner: 'facebook', repo: 'react' }
  const LONG_BODY = 'A'.repeat(250) // ≥ 200 chars, not link-only

  beforeEach(() => {
    mockParseGitHubRepo.mockClear().mockReturnValue(REPO)
    mockFetchReleases.mockClear().mockResolvedValue([])
    mockFetchChangelogContents.mockClear().mockResolvedValue(null)
    mockSearchChangelog.mockClear().mockResolvedValue(null)
  })

  it('returns github-releases when release body is >= 200 chars', async () => {
    mockFetchReleases.mockResolvedValue([{ tag_name: 'v18.0.0', body: LONG_BODY }])

    const result = await resolveChangelog('react', '17.0.2', '18.0.0', REPO_URL)

    expect(result.source).toBe('github-releases')
    expect(mockFetchChangelogContents).not.toHaveBeenCalled()
  })

  it('falls through to github-changelog when release body is < 200 chars', async () => {
    mockFetchReleases.mockResolvedValue([{ tag_name: 'v18.0.0', body: 'Short body.' }])
    mockFetchChangelogContents.mockResolvedValue('## 18.0.0\n\n' + 'Changelog content. '.repeat(20))

    const result = await resolveChangelog('react', '17.0.2', '18.0.0', REPO_URL)

    expect(result.source).toBe('github-changelog')
  })

  it('falls through to github-changelog when release body is link-only', async () => {
    const linkOnlyBody = '[See full changelog](https://react.dev/changelog) and nothing else'
    mockFetchReleases.mockResolvedValue([{ tag_name: 'v18.0.0', body: linkOnlyBody }])
    mockFetchChangelogContents.mockResolvedValue('## 18.0.0\n\n' + 'Details. '.repeat(20))

    const result = await resolveChangelog('react', '17.0.2', '18.0.0', REPO_URL)

    expect(result.source).toBe('github-changelog')
  })

  it('falls through to github-changelog when no release matches latestVersion', async () => {
    mockFetchReleases.mockResolvedValue([{ tag_name: 'v17.0.0', body: LONG_BODY }])
    mockFetchChangelogContents.mockResolvedValue('## 18.0.0\n\n' + 'Content. '.repeat(20))

    const result = await resolveChangelog('react', '17.0.2', '18.0.0', REPO_URL)

    expect(result.source).toBe('github-changelog')
  })

  it('falls through to exa when both GitHub sources return nothing', async () => {
    mockFetchReleases.mockResolvedValue([])
    mockFetchChangelogContents.mockResolvedValue(null)
    mockSearchChangelog.mockResolvedValue('Exa found migration guide here')

    const result = await resolveChangelog('react', '17.0.2', '18.0.0', REPO_URL)

    expect(result.source).toBe('exa')
    expect(result.text).toBe('Exa found migration guide here')
  })

  it('returns none when all sources return nothing', async () => {
    mockFetchReleases.mockResolvedValue([])
    mockFetchChangelogContents.mockResolvedValue(null)
    mockSearchChangelog.mockResolvedValue(null)

    const result = await resolveChangelog('react', '17.0.2', '18.0.0', REPO_URL)

    expect(result).toEqual({ text: '', source: 'none', coverageGap: null })
  })

  it('skips step 2 and goes to Exa when fetchReleases returns null (403)', async () => {
    mockFetchReleases.mockResolvedValue(null)
    mockSearchChangelog.mockResolvedValue('Exa fallback text')

    const result = await resolveChangelog('react', '17.0.2', '18.0.0', REPO_URL)

    expect(result.source).toBe('exa')
    expect(mockFetchChangelogContents).not.toHaveBeenCalled()
  })

  it('skips steps 1 and 2 when repositoryUrl is undefined', async () => {
    mockSearchChangelog.mockResolvedValue('Exa result for no-repo package')

    const result = await resolveChangelog('some-package', '1.0.0', '2.0.0', undefined)

    expect(result.source).toBe('exa')
    expect(mockFetchReleases).not.toHaveBeenCalled()
    expect(mockFetchChangelogContents).not.toHaveBeenCalled()
  })

  it('skips steps 1 and 2 when parseGitHubRepo returns null (non-GitHub URL)', async () => {
    mockParseGitHubRepo.mockReturnValue(null)
    mockSearchChangelog.mockResolvedValue('Exa result')

    const result = await resolveChangelog('pkg', '1.0.0', '2.0.0', 'https://gitlab.com/owner/repo')

    expect(result.source).toBe('exa')
    expect(mockFetchReleases).not.toHaveBeenCalled()
  })

  it('matches monorepo-style tag like packageName@version', async () => {
    mockFetchReleases.mockResolvedValue([{ tag_name: '@babel/core@7.24.0', body: LONG_BODY }])

    const result = await resolveChangelog(
      '@babel/core',
      '7.23.0',
      '7.24.0',
      'https://github.com/babel/babel',
    )

    expect(result.source).toBe('github-releases')
  })

  it('reports a coverage gap when a multi-major jump misses intermediate majors', async () => {
    // Range 1.0.0 → 4.0.0 spans majors 2, 3, 4; only v4 has release notes.
    const v4Body = `## 4.0.0\n\n${'Breaking change in v4. '.repeat(20)}`
    mockFetchReleases.mockResolvedValue([{ tag_name: 'v4.0.0', body: v4Body }])
    mockFetchChangelogContents.mockResolvedValue(null)

    const result = await resolveChangelog('pkg', '1.0.0', '4.0.0', REPO_URL)

    expect(result.coverageGap).not.toBeNull()
    expect(result.coverageGap).toContain('v2.x')
    expect(result.coverageGap).toContain('v3.x')
    expect(result.coverageGap).not.toContain('v4.x')
  })

  it('reports no coverage gap when all majors in range are present', async () => {
    const section = (label: string) => `Breaking change details for ${label}. `.repeat(15) // > 300 chars

    const body = `## 4.0.0\n\n${section('v4')}\n\n## 3.0.0\n\n${section('v3')}\n\n## 2.0.0\n\n${section('v2')}`

    mockFetchReleases.mockResolvedValue([{ tag_name: 'v4.0.0', body }])
    mockFetchChangelogContents.mockResolvedValue(null)

    const result = await resolveChangelog('pkg', '1.0.0', '4.0.0', REPO_URL)

    expect(result.coverageGap).toBeNull()
  })

  it('reports a coverage gap when a major has only a link-only stub section', async () => {
    // v3.0.0's section exists but only points to an external wiki — no real content.
    const section = (label: string) => `Breaking change details for ${label}. `.repeat(15)

    const body = `## 4.0.0\n\n${section('v4')}\n\n## 3.0.0\n\n[See the wiki](https://example.com/wiki)\n\n## 2.0.0\n\n${section('v2')}`

    mockFetchReleases.mockResolvedValue([{ tag_name: 'v4.0.0', body }])
    mockFetchChangelogContents.mockResolvedValue(null)

    const result = await resolveChangelog('pkg', '1.0.0', '4.0.0', REPO_URL)

    expect(result.coverageGap).not.toBeNull()
    expect(result.coverageGap).toContain('v3.x')
    expect(result.coverageGap).not.toContain('v2.x')
    expect(result.coverageGap).not.toContain('v4.x')
  })

  it('reports no coverage gap for a single-major jump', async () => {
    mockFetchReleases.mockResolvedValue([{ tag_name: 'v18.0.0', body: LONG_BODY }])

    const result = await resolveChangelog('react', '17.0.2', '18.0.0', REPO_URL)

    expect(result.coverageGap).toBeNull()
  })
})
