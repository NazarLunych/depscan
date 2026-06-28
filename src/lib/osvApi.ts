import type { OsvVulnerability, Vulnerability } from '@/types'

import { OsvQueryResponseSchema } from '@/lib/schemas'

function parseCvssScore(score: string): number {
  const numeric = parseFloat(score)

  return isNaN(numeric) ? 0 : numeric
}

function scoreToSeverity(score: number): Vulnerability['severity'] {
  if (score >= 9) return 'critical'

  if (score >= 7) return 'high'

  if (score >= 4) return 'medium'

  return 'low'
}

type RangeEvent = { introduced?: string; fixed?: string }

function deriveAffectedRange(events: RangeEvent[]): string {
  const introduced = events.find((e) => e.introduced !== undefined)?.introduced
  const fixed = events.find((e) => e.fixed !== undefined)?.fixed

  if (introduced === undefined && fixed === undefined) return '*'

  if (introduced === '0' || introduced === undefined) {
    return fixed !== undefined ? `< ${fixed}` : '*'
  }

  return fixed !== undefined ? `>= ${introduced} < ${fixed}` : `>= ${introduced}`
}

export function normalizeOsvVulnerability(osv: OsvVulnerability): Vulnerability {
  const scoreStr = osv.severity?.[0]?.score ?? ''
  const severity = scoreToSeverity(parseCvssScore(scoreStr))
  const events = (osv.affected?.[0]?.ranges?.[0]?.events ?? []) as RangeEvent[]
  const affectedRange = deriveAffectedRange(events)
  const fixedIn = events.find((e) => e.fixed !== undefined)?.fixed
  const url = osv.references?.[0]?.url

  return {
    id: osv.id,
    title: osv.summary ?? osv.id,
    severity,
    affectedRange,
    ...(fixedIn !== undefined && { fixedIn }),
    ...(url !== undefined && { url }),
  }
}

export async function queryOsvVulnerabilities(
  packageName: string,
  version: string,
): Promise<Vulnerability[]> {
  const res = await fetch('https://api.osv.dev/v1/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: { name: packageName, ecosystem: 'npm' }, version }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    throw new Error(`OSV query error ${res.status} for ${packageName}@${version}`)
  }

  const result = OsvQueryResponseSchema.safeParse(await res.json())

  if (!result.success) {
    throw new Error(`OSV response schema mismatch for ${packageName}@${version}`)
  }

  return (result.data.vulns ?? []).map(normalizeOsvVulnerability)
}

export function mergeVulnerabilities(
  npmVulns: Vulnerability[],
  osvVulns: Vulnerability[],
): Vulnerability[] {
  const map = new Map<string, Vulnerability>()

  for (const v of osvVulns) map.set(v.id, v)

  for (const v of npmVulns) map.set(v.id, v)

  return Array.from(map.values())
}
