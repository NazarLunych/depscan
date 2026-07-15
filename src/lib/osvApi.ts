import type { OsvVulnerability, Vulnerability } from '@/types'

import { fetchWithRetry, withTimeout } from '@/lib/httpClient'
import { OsvQueryResponseSchema } from '@/lib/schemas'

function parseCvssScore(score: string): number {
  const numeric = Number.parseFloat(score)

  return Number.isNaN(numeric) ? 0 : numeric
}

function scoreToSeverity(score: number): Vulnerability['severity'] {
  if (score >= 9) return 'critical'

  if (score >= 7) return 'high'

  if (score >= 4) return 'medium'

  return 'low'
}

// OSV's severity[].score is a CVSS vector string ("CVSS:3.1/AV:N/..."), not a
// number — parseFloat on it yields NaN. The ready-made bucket in
// database_specific.severity is the reliable source; only fall back to the
// numeric path if a plain numeric score ever shows up.
const OSV_SEVERITY_MAP: Record<string, Vulnerability['severity']> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MODERATE: 'medium',
  MEDIUM: 'medium',
  LOW: 'low',
}

function resolveOsvSeverity(osv: OsvVulnerability): Vulnerability['severity'] {
  const bucket = osv.database_specific?.severity?.toUpperCase() ?? ''
  const mapped = OSV_SEVERITY_MAP[bucket]

  if (mapped) return mapped

  const numericScore = parseCvssScore(osv.severity?.[0]?.score ?? '')

  return numericScore > 0 ? scoreToSeverity(numericScore) : 'low'
}

type RangeEvent = { introduced?: string; fixed?: string }

function deriveAffectedRange(events: RangeEvent[]): string {
  const introduced = events.find((e) => e.introduced !== undefined)?.introduced
  const fixed = events.find((e) => e.fixed !== undefined)?.fixed

  if (introduced === undefined && fixed === undefined) return '*'

  if (introduced === '0' || introduced === undefined) {
    return fixed == undefined ? '*' : `< ${fixed}`
  }

  return fixed == undefined ? `>= ${introduced}` : `>= ${introduced} < ${fixed}`
}

export function normalizeOsvVulnerability(
  osv: OsvVulnerability,
  packageName: string,
): Vulnerability {
  const severity = resolveOsvSeverity(osv)
  const events = (osv.affected?.[0]?.ranges?.[0]?.events ?? []) as RangeEvent[]
  const affectedRange = deriveAffectedRange(events)
  const fixedIn = events.find((e) => e.fixed !== undefined)?.fixed
  const url = osv.references?.[0]?.url
  const cveId = osv.aliases?.find((alias) => alias.startsWith('CVE-')) ?? null

  return {
    id: osv.id,
    packageName,
    title: osv.summary ?? osv.id,
    severity,
    affectedRange,
    cveId,
    ...(fixedIn !== undefined && { fixedIn }),
    ...(url !== undefined && { url }),
  }
}

export async function queryOsvVulnerabilities(
  packageName: string,
  version: string,
  signal?: AbortSignal,
): Promise<Vulnerability[]> {
  const res = await fetchWithRetry(
    'https://api.osv.dev/v1/query',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: { name: packageName, ecosystem: 'npm' }, version }),
      signal: withTimeout(signal, 10_000),
    },
    signal,
  )

  if (!res.ok) {
    throw new Error(`OSV query error ${res.status} for ${packageName}@${version}`)
  }

  const result = OsvQueryResponseSchema.safeParse(await res.json())

  if (!result.success) {
    throw new Error(`OSV response schema mismatch for ${packageName}@${version}`)
  }

  return (result.data.vulns ?? []).map((vuln) => normalizeOsvVulnerability(vuln, packageName))
}

// GHSA / CVE identifier, wherever it appears (id itself or the advisory url).
// Lets us collapse the same advisory arriving from npm (numeric id, GHSA url) and
// OSV (GHSA id) into one entry instead of double-counting it in the security list.
const GHSA_CVE_REGEX = /(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}|CVE-\d{4}-\d+)/i

function dedupeKey(vuln: Vulnerability): string {
  const fromId = GHSA_CVE_REGEX.exec(vuln.id)?.[1]

  if (fromId) return fromId.toUpperCase()

  const fromUrl = vuln.url ? GHSA_CVE_REGEX.exec(vuln.url)?.[1] : undefined

  if (fromUrl) return fromUrl.toUpperCase()

  return vuln.id
}

export function mergeVulnerabilities(
  npmVulns: Vulnerability[],
  osvVulns: Vulnerability[],
): Vulnerability[] {
  const osvByKey = new Map<string, Vulnerability>()

  for (const v of osvVulns) osvByKey.set(dedupeKey(v), v)

  const map = new Map<string, Vulnerability>(osvByKey)

  // npm wins on collision, but npm advisories never carry a CVE id — recover it
  // from the matching OSV record (which does) rather than losing it on merge.
  for (const v of npmVulns) {
    const key = dedupeKey(v)
    const osvMatch = osvByKey.get(key)
    const cveId = v.cveId ?? osvMatch?.cveId ?? null

    map.set(key, { ...v, cveId })
  }

  return Array.from(map.values())
}
