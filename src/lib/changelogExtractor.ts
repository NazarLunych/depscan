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
const HEADING_PREFIX_REGEX = /^#{1,3}\s+/
const HEADING_VERSION_REGEX = /\d{1,6}\.\d{1,6}/
const VERSION_REGEX = /(\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-z0-9.]{1,50})?)/i

function isHeadingLine(line: string): boolean {
  const match = HEADING_PREFIX_REGEX.exec(line)

  return match !== null && HEADING_VERSION_REGEX.test(line.slice(match[0].length))
}

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
    if (isHeadingLine(line)) {
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

const MARKDOWN_LINK_PATTERN = /\[([^\][]*)]\([^()]*\)/g

function isLinkOnly(text: string): boolean {
  const stripped = text.replace(MARKDOWN_LINK_PATTERN, '').trim()

  return stripped.length < 100
}

type ChangelogResult = { text: string; source: ChangelogSource; coverageGap: string | null }

// Internal shape returned by the per-source resolvers, before resolveChangelog
// attaches the coverage-gap note in one place.
type ResolvedSource = { text: string; source: ChangelogSource }

// A section only counts as "covered" once it has enough non-link prose — a
// heading followed by a single "see wiki for changes" link (e.g. lodash 3.0.0's
// release body) is not meaningfully different from having no section at all.
const MIN_SECTION_CONTENT_CHARS = 300

function strippedLinkContentLength(text: string): number {
  return text.replace(MARKDOWN_LINK_PATTERN, '$1').trim().length
}

function safeMajor(version: string): number | null {
  try {
    return semver.major(version)
  } catch {
    return null
  }
}

// Sums the non-link content length of every version section in `text`, keyed
// by major version — e.g. a v3.1.0 and a v3.2.0 section both contribute to
// major 3's total.
function computeContentLengthByMajor(text: string): Map<number, number> {
  const contentLengthByMajor = new Map<number, number>()
  let currentMajor: number | null = null
  let currentLines: string[] = []

  const flush = () => {
    if (currentMajor === null) return

    const contentLength = strippedLinkContentLength(currentLines.join('\n'))
    const existing = contentLengthByMajor.get(currentMajor) ?? 0

    contentLengthByMajor.set(currentMajor, existing + contentLength)
  }

  for (const line of text.split('\n')) {
    if (!isHeadingLine(line)) {
      if (currentMajor !== null) currentLines.push(line)

      continue
    }

    flush()

    const version = VERSION_REGEX.exec(line)?.[1]

    currentMajor = version ? safeMajor(version) : null
    currentLines = []
  }

  flush()

  return contentLengthByMajor
}

function findMissingMajors(
  contentLengthByMajor: Map<number, number>,
  fromMajor: number,
  toMajor: number,
): number[] {
  const missing: number[] = []

  for (let major = fromMajor + 1; major <= toMajor; major++) {
    const contentLength = contentLengthByMajor.get(major) ?? 0

    if (contentLength < MIN_SECTION_CONTENT_CHARS) missing.push(major)
  }

  return missing
}

// Which major versions in (currentVersion, latestVersion] have a version
// section with substantive content in the resolved changelog text? A jump like
// 1.0.0 → 4.x should surface real detail for majors 2, 3 and 4 — if any section
// is missing or is just a link-only stub, the history is partial and we say so
// explicitly rather than letting a thin v3.0.0 mention or a v3→v4-only excerpt
// read as the full story.
function detectCoverageGap(
  text: string,
  currentVersion: string,
  latestVersion: string,
): string | null {
  const fromMajor = safeMajor(currentVersion)
  const toMajor = safeMajor(latestVersion)

  if (fromMajor === null || toMajor === null) return null

  // Only meaningful for multi-major jumps; single-major upgrades don't have
  // "intermediate majors" to miss.
  if (toMajor - fromMajor < 2) return null

  const contentLengthByMajor = computeContentLengthByMajor(text)
  const missing = findMissingMajors(contentLengthByMajor, fromMajor, toMajor)

  if (missing.length === 0) return null

  const majorList = missing.map((m) => `v${m}.x`).join(', ')

  return `Changelog coverage is incomplete: no substantive release notes were found for major version(s) ${majorList} between ${currentVersion} and ${latestVersion} (missing entirely, or only a brief/link-only mention). Breaking changes introduced in those majors are NOT reflected in changelogText below.`
}

function extractTagVersion(tagName: string, packageName: string): string | null {
  const withoutPackagePrefix = tagName.startsWith(`${packageName}@`)
    ? tagName.slice(`${packageName}@`.length)
    : tagName

  return VERSION_REGEX.exec(withoutPackagePrefix)?.[1] ?? null
}

// Collects every release whose tag falls in (currentVersion, latestVersion] — a
// major-version jump (e.g. 1.x → 4.x) spans multiple GitHub releases, not just
// the one tagged with latestVersion.
function collectReleaseBodies(
  releases: GitHubRelease[],
  packageName: string,
  currentVersion: string,
  latestVersion: string,
): string {
  const inRange = releases.filter((r) => {
    const version = extractTagVersion(r.tag_name, packageName)

    if (!version) return false

    try {
      return semver.gt(version, currentVersion) && semver.lte(version, latestVersion)
    } catch {
      return false
    }
  })

  return inRange
    .map((r) => r.body ?? '')
    .filter((body) => body && !isLinkOnly(body))
    .join('\n\n')
}

function resolveFromGitHubReleases(
  releases: GitHubRelease[],
  packageName: string,
  currentVersion: string,
  latestVersion: string,
): ResolvedSource | null {
  const combinedBody = collectReleaseBodies(releases, packageName, currentVersion, latestVersion)

  if (combinedBody.length < 200) return null

  const text = extractRelevantSections(combinedBody, currentVersion, latestVersion)

  return { text, source: 'github-releases' }
}

async function resolveFromGitHubChangelog(
  repo: { owner: string; repo: string },
  currentVersion: string,
  latestVersion: string,
): Promise<ResolvedSource | null> {
  const changelogFile = await fetchChangelogContents(repo.owner, repo.repo)

  if (!changelogFile) return null

  const text = extractRelevantSections(changelogFile, currentVersion, latestVersion)

  return text.length > 0 ? { text, source: 'github-changelog' } : null
}

// GitHub Release bodies for major versions are often a marketing-style summary
// (e.g. lodash 4.0.0's "2015 was a big year!") that never mentions the actual
// removed/renamed APIs — that detail usually lives in CHANGELOG.md instead. When
// the upgrade spans more than one major version, merge in CHANGELOG.md content
// too instead of trusting the release notes alone.
function spansMultipleMajors(currentVersion: string, latestVersion: string): boolean {
  try {
    return semver.major(latestVersion) - semver.major(currentVersion) > 1
  } catch {
    return false
  }
}

async function resolveFromExa(
  packageName: string,
  latestVersion: string,
): Promise<ResolvedSource | null> {
  const exaText = await searchChangelog(packageName, latestVersion)

  return exaText && exaText.length > 0 ? { text: exaText, source: 'exa' } : null
}

async function resolveSource(
  packageName: string,
  currentVersion: string,
  latestVersion: string,
  repositoryUrl: string | undefined,
): Promise<ResolvedSource> {
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

    if (releasesResult && spansMultipleMajors(currentVersion, latestVersion)) {
      const changelogResult = await resolveFromGitHubChangelog(repo, currentVersion, latestVersion)

      if (changelogResult) {
        const merged = `${releasesResult.text}\n\n${changelogResult.text}`.slice(0, MAX_CHARS)

        return { text: merged, source: 'github-releases' }
      }
    }

    if (releasesResult) return releasesResult

    const changelogResult = await resolveFromGitHubChangelog(repo, currentVersion, latestVersion)

    if (changelogResult) return changelogResult
  }

  const exaResult = await resolveFromExa(packageName, latestVersion)

  return exaResult ?? { text: '', source: 'none' }
}

export async function resolveChangelog(
  packageName: string,
  currentVersion: string,
  latestVersion: string,
  repositoryUrl: string | undefined,
): Promise<ChangelogResult> {
  const resolved = await resolveSource(packageName, currentVersion, latestVersion, repositoryUrl)
  const coverageGap = detectCoverageGap(resolved.text, currentVersion, latestVersion)

  return { ...resolved, coverageGap }
}
