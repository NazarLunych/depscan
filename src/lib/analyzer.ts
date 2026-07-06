import type { AnalyzerResult, Vulnerability } from '@/types'

import { resolveChangelog } from '@/lib/changelogExtractor'
import { callClaude } from '@/lib/claudeClient'
import { fetchPackument, filterRelevantAdvisories, resolveCurrentVersion } from '@/lib/npmRegistry'
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
    const { text: changelogText, source: changelogSource } = await resolveChangelog(
      name,
      currentVersion,
      latestVersion,
      versionMeta.repository?.url,
    )
    const facts = HardFactsSchema.parse({
      packageName: name,
      currentVersion,
      latestVersion,
      deprecated: versionMeta.deprecated ?? null,
      vulnerabilities,
      changelogText,
      changelogSource,
    })
    const analysis = await callClaude(facts)

    return { status: 'done', name, currentVersion, analysis }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    return { status: 'error', name, currentVersion, error: message }
  }
}
