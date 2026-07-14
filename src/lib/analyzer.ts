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
): Promise<AnalyzerResult> {
  let currentVersion: string | null = null

  try {
    const packument = await fetchPackument(name)

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
    const osvAdvisories = await queryOsvVulnerabilities(name, currentVersion)
    const vulnerabilities = mergeVulnerabilities(npmAdvisories, osvAdvisories)
    const {
      text: changelogText,
      source: changelogSource,
      coverageGap,
    } = await resolveChangelog(name, currentVersion, latestVersion, versionMeta.repository?.url)
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
    const analysis = await callClaude(facts)

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

    const message = err instanceof Error ? err.message : String(err)

    return { status: 'error', name, currentVersion, error: message }
  }
}
