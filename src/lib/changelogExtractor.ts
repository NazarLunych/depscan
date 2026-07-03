import type { ChangelogSource } from '@/types'
import semver from 'semver'

import { searchChangelog } from '@/lib/exaSearch'
import {
  fetchChangelogContents,
  fetchReleases,
  parseGitHubRepo,
  type GitHubRelease,
} from '@/lib/githubReleases'

const MAX_CHARS = 8_000
// Matches headings like: ## 2.0.0, ## v2.0.0, ## [2.0.0], ## 2.0.0 (2024-01-15), # v2.0.0
const HEADING_REGEX = /^#{1,3}\s+.*?\d+\.\d+/m
const VERSION_REGEX = /(\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)/i

export function extractRelevantSections(
  text: string,
  fromVersion: string,
  toVersion: string,
): string {
  if (!text) return ''

  const lines = text.split('\n')
  const sections: Array<{ version: string | null; lines: string[] }> = []
  let current: { version: string | null; lines: string[] } | null = null

  for (const line of lines) {
    if (HEADING_REGEX.test(line)) {
      if (current) sections.push(current)

      const match = VERSION_REGEX.exec(line)
      current = { version: match?.[1] ?? null, lines: [line] }
    } else if (current) {
      current.lines.push(line)
    }
  }

  if (current) sections.push(current)

  const relevant = sections.filter(({ version }) => {
    if (!version) return true

    try {
      return semver.gt(version, fromVersion) && semver.lte(version, toVersion)
    } catch {
      return true
    }
  })
  const joined = relevant.length > 0 ? relevant.map((s) => s.lines.join('\n')).join('\n') : text

  return joined.slice(0, MAX_CHARS)
}

function isLinkOnly(text: string): boolean {
  const stripped = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '').trim()

  return stripped.length < 100
}

type ChangelogResult = { text: string; source: ChangelogSource }

function pickReleaseBody(
  releases: GitHubRelease[],
  packageName: string,
  latestVersion: string,
): string | null {
  const tagCandidates = new Set([
    `v${latestVersion}`,
    latestVersion,
    `${packageName}@${latestVersion}`,
  ])

  return releases.find((r) => tagCandidates.has(r.tag_name))?.body ?? null
}

function resolveFromGitHubReleases(
  releases: GitHubRelease[],
  packageName: string,
  currentVersion: string,
  latestVersion: string,
): ChangelogResult | null {
  const body = pickReleaseBody(releases, packageName, latestVersion)

  if (!body || body.length < 200 || isLinkOnly(body)) return null

  const text = extractRelevantSections(body, currentVersion, latestVersion)

  return { text, source: 'github-releases' }
}

async function resolveFromGitHubChangelog(
  repo: { owner: string; repo: string },
  currentVersion: string,
  latestVersion: string,
): Promise<ChangelogResult | null> {
  const changelogFile = await fetchChangelogContents(repo.owner, repo.repo)

  if (!changelogFile) return null

  const text = extractRelevantSections(changelogFile, currentVersion, latestVersion)

  return text.length > 0 ? { text, source: 'github-changelog' } : null
}

async function resolveFromExa(
  packageName: string,
  latestVersion: string,
): Promise<ChangelogResult | null> {
  const exaText = await searchChangelog(packageName, latestVersion)

  return exaText && exaText.length > 0 ? { text: exaText, source: 'exa' } : null
}

export async function resolveChangelog(
  packageName: string,
  currentVersion: string,
  latestVersion: string,
  repositoryUrl: string | undefined,
): Promise<ChangelogResult> {
  const repo = repositoryUrl ? parseGitHubRepo(repositoryUrl) : null
  const releases = repo ? await fetchReleases(repo.owner, repo.repo) : null

  // releases === null means either no repo, or GitHub was unreachable (403/rate-limit) —
  // either way Step 2 is skipped and we fall through to Exa.
  if (repo && releases !== null) {
    const releasesResult = resolveFromGitHubReleases(
      releases,
      packageName,
      currentVersion,
      latestVersion,
    )

    if (releasesResult) return releasesResult

    const changelogResult = await resolveFromGitHubChangelog(repo, currentVersion, latestVersion)

    if (changelogResult) return changelogResult
  }

  const exaResult = await resolveFromExa(packageName, latestVersion)

  return exaResult ?? { text: '', source: 'none' }
}
