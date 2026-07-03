// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchChangelogContents, fetchReleases, parseGitHubRepo } from '@/lib/githubReleases'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReleasesResponse(
  releases: Array<{ tag_name: string; body: string | null }>,
  etag = '"abc123"',
  status = 200,
) {
  return new Response(JSON.stringify(releases), {
    status,
    headers: {
      'content-type': 'application/json',
      etag,
      'x-ratelimit-remaining': '50',
    },
  })
}

function makeContentsResponse(content: string, status = 200) {
  const encoded = Buffer.from(content, 'utf-8').toString('base64')

  return new Response(JSON.stringify({ content: encoded, encoding: 'base64' }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// ─── parseGitHubRepo ──────────────────────────────────────────────────────────

describe('parseGitHubRepo', () => {
  it('parses plain https URL', () => {
    expect(parseGitHubRepo('https://github.com/facebook/react')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('parses https URL with .git suffix', () => {
    expect(parseGitHubRepo('https://github.com/facebook/react.git')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('parses git+https:// URL', () => {
    expect(parseGitHubRepo('git+https://github.com/facebook/react.git')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('parses git:// URL', () => {
    expect(parseGitHubRepo('git://github.com/facebook/react.git')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('parses git+ssh://git@ URL', () => {
    expect(parseGitHubRepo('git+ssh://git@github.com/facebook/react.git')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('parses github: shorthand', () => {
    expect(parseGitHubRepo('github:facebook/react')).toEqual({
      owner: 'facebook',
      repo: 'react',
    })
  })

  it('returns null for GitLab URL', () => {
    expect(parseGitHubRepo('https://gitlab.com/owner/repo')).toBeNull()
  })

  it('returns null for Bitbucket URL', () => {
    expect(parseGitHubRepo('https://bitbucket.org/owner/repo')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseGitHubRepo('')).toBeNull()
  })

  it('parses scoped org repo', () => {
    expect(parseGitHubRepo('https://github.com/emotion-js/emotion')).toEqual({
      owner: 'emotion-js',
      repo: 'emotion',
    })
  })

  it('returns null for malformed URL', () => {
    expect(parseGitHubRepo('not-a-url')).toBeNull()
  })

  it('returns null for github: shorthand with missing repo', () => {
    expect(parseGitHubRepo('github:owneronly')).toBeNull()
  })
})

// ─── fetchReleases ────────────────────────────────────────────────────────────

describe('fetchReleases', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // Clear the ETag cache between tests by resetting module — not needed because
    // each test uses distinct owner/repo keys
  })

  it('returns releases array on 200', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        makeReleasesResponse([{ tag_name: 'v18.0.0', body: 'Release notes here' }]),
      )
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchReleases('facebook', 'react-200test')
    expect(result).toEqual([{ tag_name: 'v18.0.0', body: 'Release notes here' }])
  })

  it('stores ETag and returns cached releases on 304', async () => {
    const releases = [{ tag_name: 'v18.0.0', body: 'notes' }]
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeReleasesResponse(releases, '"etag-value"'))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: { etag: '"etag-value"', 'x-ratelimit-remaining': '40' },
        }),
      )

    vi.stubGlobal('fetch', mockFetch)

    const first = await fetchReleases('facebook', 'react-304test')
    const second = await fetchReleases('facebook', 'react-304test')

    expect(first).toEqual(releases)
    expect(second).toEqual(releases)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns null on 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
        ),
    )

    expect(await fetchReleases('facebook', 'react-403test')).toBeNull()
  })

  it('returns null when x-ratelimit-remaining is 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            'x-ratelimit-remaining': '0',
            etag: '"e1"',
            'content-type': 'application/json',
          },
        }),
      ),
    )

    expect(await fetchReleases('facebook', 'react-ratelimit0')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    expect(await fetchReleases('facebook', 'react-throw')).toBeNull()
  })
})

// ─── fetchChangelogContents ───────────────────────────────────────────────────

describe('fetchChangelogContents', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('decodes base64 content on 200', async () => {
    const content = '# Changelog\n\n## 2.0.0\n\nBreaking changes here.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeContentsResponse(content)))

    const result = await fetchChangelogContents('owner', 'repo-200')
    expect(result).toBe(content)
  })

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    expect(await fetchChangelogContents('owner', 'repo-404')).toBeNull()
  })

  it('returns null on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))

    expect(await fetchChangelogContents('owner', 'repo-403')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

    expect(await fetchChangelogContents('owner', 'repo-throw')).toBeNull()
  })
})
