import type { AnalyzerResult, Vulnerability } from '@/types'
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
    const analysis = await callClaude(facts, signal)

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