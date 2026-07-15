import type { AnalyzerResult, HardFacts, PackageAnalysis, Vulnerability } from '@/types'
import { z } from 'zod'

import { resolveChangelog } from '@/lib/changelogExtractor'
import { callClaude } from '@/lib/claudeClient'
import {
  fetchPackument,
  filterRelevantAdvisories,
  normalizeDeprecated,
  resolveCurrentVersion,
} from '@/lib/npmRegistry'
import { mergeVulnerabilities, queryOsvVulnerabilities } from '@/lib/osvApi'
import { HardFactsSchema } from '@/lib/schemas'

// In-memory cache of Claude verdicts, keyed by the full HardFacts content (not
// just name+version) — a new vulnerability or changelog update for the same
// version must produce a fresh call, not a stale hit. Lives only for this
// server instance's lifetime; a serverless cold start or a different instance
// still calls Claude again (see Week 6 follow-up: Vercel KV for a shared cache).
// Stores the in-flight Promise (not just the resolved value) so concurrent
// requests for the same package dedupe onto a single Claude call instead of
// firing one each.
const CLAUDE_CACHE_TTL_MS = 60 * 60 * 1000

type CacheEntry = { promise: Promise<PackageAnalysis>; expiresAt: number }

const claudeCache = new Map<string, CacheEntry>()

function claudeCacheKey(facts: HardFacts): string {
  return JSON.stringify({
    packageName: facts.packageName,
    currentVersion: facts.currentVersion,
    latestVersion: facts.latestVersion,
    deprecated: facts.deprecated,
    latestDeprecated: facts.latestDeprecated,
    vulnerabilities: [...facts.vulnerabilities]
      .map((v) => ({ id: v.id, severity: v.severity, fixedIn: v.fixedIn ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    changelogText: facts.changelogText,
    changelogSource: facts.changelogSource,
    coverageGap: facts.coverageGap,
  })
}

// Awaits a shared cached promise without letting *this* caller's own abort
// reject it for every other concurrent awaiter — only this caller's local
// race settles when their signal fires; the underlying promise (and the
// cache entry) is untouched by that.
function awaitWithOwnSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }

  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })

    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

async function callClaudeCached(facts: HardFacts, signal?: AbortSignal): Promise<PackageAnalysis> {
  const key = claudeCacheKey(facts)
  const cached = claudeCache.get(key)

  if (cached && cached.expiresAt > Date.now()) {
    return awaitWithOwnSignal(cached.promise, signal)
  }

  const promise = callClaude(facts, signal)

  claudeCache.set(key, { promise, expiresAt: Date.now() + CLAUDE_CACHE_TTL_MS })

  // Only the creator of this cache entry evicts it on failure — every other
  // concurrent caller just awaits (via its own signal-aware race) without
  // touching the cache, so one caller's cancellation can't poison or reject
  // the result for unrelated in-flight requests.
  promise.catch(() => {
    claudeCache.delete(key)
  })

  return awaitWithOwnSignal(promise, signal)
}

export async function analyzePackage(
  name: string,
  versionRange: string,
  advisoriesForFile: Vulnerability[],
  signal?: AbortSignal,
): Promise<AnalyzerResult> {
  let currentVersion: string | null = null

  try {
    const packument = await fetchPackument(name, signal)

    currentVersion = resolveCurrentVersion(versionRange, packument)

    const latestVersion = packument['dist-tags'].latest
    const versionMeta = packument.versions[currentVersion]
    const latestMeta = packument.versions[latestVersion]

    if (!versionMeta) {
      throw new Error(`resolved version "${currentVersion}" missing from packument for "${name}"`)
    }

    const npmAdvisories = filterRelevantAdvisories(
      advisoriesForFile.filter((advisory) => advisory.packageName === name),
      currentVersion,
      latestVersion,
    )
    const [osvAdvisories, changelogResult] = await Promise.all([
      queryOsvVulnerabilities(name, currentVersion, signal),
      resolveChangelog(name, currentVersion, latestVersion, versionMeta.repository?.url, signal),
    ])
    const vulnerabilities = mergeVulnerabilities(npmAdvisories, osvAdvisories)
    const { text: changelogText, source: changelogSource, coverageGap } = changelogResult
    const facts = HardFactsSchema.parse({
      packageName: name,
      currentVersion,
      latestVersion,
      deprecated: normalizeDeprecated(versionMeta.deprecated),
      latestDeprecated: normalizeDeprecated(latestMeta?.deprecated),
      vulnerabilities,
      changelogText,
      changelogSource,
      coverageGap,
    })
    const analysis = await callClaudeCached(facts, signal)

    return { status: 'done', name, currentVersion, analysis }
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error(`[analyzer] schema validation failed for "${name}":`, err.issues)

      return {
        status: 'error',
        name,
        currentVersion,
        error: `Received unexpected data for "${name}" — analysis unavailable.`,
      }
    }

    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'error', name, currentVersion, error: 'Cancelled' }
    }

    const message = err instanceof Error ? err.message : String(err)

    return { status: 'error', name, currentVersion, error: message }
  }
}