import type { z } from 'zod'

import { withTimeout } from '@/lib/httpClient'
import { GitHubContentsResponseSchema, GitHubReleasesResponseSchema } from '@/lib/schemas'

export type GitHubRelease = z.infer<typeof GitHubReleasesResponseSchema>[number]

type ETagEntry = {
  etag: string
  releases: GitHubRelease[]
}

export type GitHubRepo = {
  owner: string
  repo: string
}

const etagCache = new Map<string, ETagEntry>()

export function parseGitHubRepo(url: string): GitHubRepo | null {
  if (!url) return null

  let normalized = url.trim()

  // Handle shorthand: github:owner/repo
  if (normalized.startsWith('github:')) {
    const path = normalized.slice('github:'.length)
    const parts = path.split('/')

    if (parts.length < 2 || !parts[0] || !parts[1]) return null

    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
  }

  // Normalize protocol variants to https://
  normalized = normalized
    .replace(/^git\+https:\/\//, 'https://')
    .replace(/^git\+ssh:\/\/git@/, 'https://')
    .replace(/^git:\/\//, 'https://')
    .replace(/^git\+/, '')

  if (!normalized.includes('github.com')) return null

  try {
    const parsed = new URL(normalized)

    if (!parsed.hostname.includes('github.com')) return null

    const segments = parsed.pathname.replace(/^\//, '').split('/')
    const owner = segments[0]
    const repo = (segments[1] ?? '').replace(/\.git$/, '')

    if (!owner || !repo) return null

    return { owner, repo }
  } catch {
    return null
  }
}

function buildGitHubHeaders(etag?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  if (etag) {
    headers['If-None-Match'] = etag
  }

  return headers
}

export async function fetchReleases(
  owner: string,
  repo: string,
  signal?: AbortSignal,
): Promise<GitHubRelease[] | null> {
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`
  const cached = etagCache.get(cacheKey)

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`, {
      headers: buildGitHubHeaders(cached?.etag),
      signal: withTimeout(signal, 10_000),
    })

    if (res.status === 304 && cached) {
      return cached.releases
    }

    if (res.status === 403 || res.headers.get('x-ratelimit-remaining') === '0') {
      return null
    }

    if (!res.ok) return null

    const parsed = GitHubReleasesResponseSchema.safeParse(await res.json())

    if (!parsed.success) return null

    const releases = parsed.data
    const etag = res.headers.get('etag') ?? ''
    etagCache.set(cacheKey, { etag, releases })

    return releases
  } catch {
    return null
  }
}

export async function fetchChangelogContents(
  owner: string,
  repo: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/CHANGELOG.md`, {
      headers: buildGitHubHeaders(),
      signal: withTimeout(signal, 10_000),
    })

    if (res.status === 404 || res.status === 403) return null

    if (!res.ok) return null

    const parsed = GitHubContentsResponseSchema.safeParse(await res.json())

    if (!parsed.success) return null

    // GitHub returns base64 with embedded newlines — strip whitespace before decoding
    return Buffer.from(parsed.data.content.replace(/\s/g, ''), 'base64').toString('utf-8')
  } catch {
    return null
  }
}
