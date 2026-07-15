import type { NpmAdvisory, NpmPackument, Vulnerability } from '@/types'
import semver from 'semver'

import { fetchWithRetry, withTimeout } from '@/lib/httpClient'
import { NpmBulkAdvisoriesResponseSchema, NpmPackumentSchema } from '@/lib/schemas'

const REGISTRY_BASE = 'https://registry.npmjs.org'

export async function fetchPackument(
  packageName: string,
  signal?: AbortSignal,
): Promise<NpmPackument> {
  const url = `${REGISTRY_BASE}/${encodeURIComponent(packageName)}`
  const res = await fetchWithRetry(url, { signal: withTimeout(signal, 10_000) }, signal)

  if (res.status === 404) {
    throw new Error(`package not found: ${packageName}`)
  }

  if (!res.ok) {
    throw new Error(`npm registry error ${res.status} for ${packageName}`)
  }

  return NpmPackumentSchema.parse(await res.json())
}

const UNRESOLVABLE_PREFIXES = [
  ['workspace:', 'workspace protocol'],
  ['npm:', 'npm alias'],
  ['git+ssh://', 'git dependency'],
  ['git+https://', 'git dependency'],
  ['git+http://', 'git dependency'],
  ['git://', 'git dependency'],
  ['git+', 'git dependency'],
  ['https://', 'URL dependency'],
  ['http://', 'URL dependency'],
] as const

export function resolveCurrentVersion(range: string, packument: NpmPackument): string {
  for (const [prefix, label] of UNRESOLVABLE_PREFIXES) {
    if (range.startsWith(prefix)) {
      throw new Error(`${label} not supported: ${range}`)
    }
  }

  if (range === 'latest' || range === '*') {
    return packument['dist-tags'].latest
  }

  const resolved = semver.maxSatisfying(Object.keys(packument.versions), range)

  if (resolved === null) {
    throw new Error(`no version satisfies range "${range}" for "${packument.name}"`)
  }

  return resolved
}

// npm registry sometimes flags a version deprecated with a boolean instead
// of the usual reason string — collapse both shapes to a message or null.
export function normalizeDeprecated(deprecated: string | boolean | undefined): string | null {
  if (typeof deprecated === 'string') {
    return deprecated
  }

  return deprecated ? 'deprecated' : null
}

const NPM_SEVERITY_MAP = {
  critical: 'critical',
  high: 'high',
  moderate: 'medium',
  low: 'low',
} as const

function normalizeNpmAdvisory(packageName: string, advisory: NpmAdvisory): Vulnerability {
  return {
    id: String(advisory.id),
    packageName,
    title: advisory.title,
    severity: NPM_SEVERITY_MAP[advisory.severity],
    affectedRange: advisory.vulnerable_versions,
    url: advisory.url,
    // npm bulk advisories never carry a CVE id — mergeVulnerabilities recovers
    // it from the matching OSV record, which does.
    cveId: null,
  }
}

export async function fetchBulkAdvisories(
  packages: Record<string, string>,
  signal?: AbortSignal,
): Promise<Vulnerability[]> {
  const body: Record<string, string[]> = {}

  for (const [name, version] of Object.entries(packages)) {
    body[name] = [version]
  }

  const res = await fetchWithRetry(
    `${REGISTRY_BASE}/-/npm/v1/security/advisories/bulk`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: withTimeout(signal, 15_000),
    },
    signal,
  )

  if (!res.ok) {
    throw new Error(`npm bulk advisories error ${res.status}`)
  }

  const parsed = NpmBulkAdvisoriesResponseSchema.parse(await res.json())

  return Object.entries(parsed).flatMap(([packageName, advisories]) =>
    advisories.map((advisory) => normalizeNpmAdvisory(packageName, advisory)),
  )
}

export function filterRelevantAdvisories(
  advisories: Vulnerability[],
  currentVersion: string,
  latestVersion: string,
): Vulnerability[] {
  return advisories.filter((advisory) => {
    try {
      const currentAffected = semver.satisfies(currentVersion, advisory.affectedRange)
      const latestEscapes = semver.gtr(latestVersion, advisory.affectedRange)

      return currentAffected && latestEscapes
    } catch {
      return false
    }
  })
}
