import type { NpmAdvisory, NpmPackument, Vulnerability } from '@/types'
import semver from 'semver'

import { NpmBulkAdvisoriesResponseSchema, NpmPackumentSchema } from '@/lib/schemas'

const REGISTRY_BASE = 'https://registry.npmjs.org'

export async function fetchPackument(packageName: string): Promise<NpmPackument> {
  const url = `${REGISTRY_BASE}/${encodeURIComponent(packageName)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })

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
  }
}

export async function fetchBulkAdvisories(
  packages: Record<string, string>,
): Promise<Vulnerability[]> {
  const body: Record<string, string[]> = {}

  for (const [name, version] of Object.entries(packages)) {
    body[name] = [version]
  }

  const res = await fetch(`${REGISTRY_BASE}/-/npm/v1/security/advisories/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })

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
