import { z } from 'zod'

// ─── Primitive literals ────────────────────────────────────────────────────

export const HighlightSchema = z.enum(['red', 'yellow', 'none'])

export const RoiSchema = z.enum(['low', 'middle', 'high'])

export const SecurityRiskSchema = z.enum(['critical', 'high', 'medium', 'low', 'none'])

export const ChangelogSourceSchema = z.enum(['github-releases', 'github-changelog', 'exa', 'none'])

export const PackageStatusSchema = z.enum(['pending', 'analyzing', 'done', 'error'])

export const SseEventTypeSchema = z.enum(['started', 'package-done', 'error', 'done'])

// ─── Claude output (what the AI returns as JSON) ──────────────────────────

export const PackageAnalysisSchema = z.object({
  package: z.string().min(1),
  current_version: z.string(),
  target_version: z.string(),
  breaking_changes: z.array(z.string()),
  migration_steps: z.array(z.string()),
  security_risks: SecurityRiskSchema,
  roi: RoiSchema,
  highlight: HighlightSchema,
})

// ─── Analyzer result — analyzePackage's terminal outcome ──────────────────

export const AnalyzerResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('done'),
    name: z.string().min(1),
    currentVersion: z.string(),
    analysis: PackageAnalysisSchema,
  }),
  z.object({
    status: z.literal('error'),
    name: z.string().min(1),
    currentVersion: z.string().nullable(),
    error: z.string(),
  }),
])

// ─── Vulnerability — shared between npm bulk advisories and OSV ───────────

export const VulnerabilitySchema = z.object({
  id: z.string(),
  packageName: z.string(),
  title: z.string(),
  severity: SecurityRiskSchema,
  affectedRange: z.string(),
  fixedIn: z.string().optional(),
  url: z.string().url().optional(),
  cveId: z.string().nullable(),
})

// ─── Hard facts passed to Claude ──────────────────────────────────────────

export const HardFactsSchema = z.object({
  packageName: z.string().min(1),
  currentVersion: z.string(),
  latestVersion: z.string(),
  deprecated: z.string().nullable(),
  // Deprecation note for the target (latest) version specifically — a version
  // can be flagged as a bad release (e.g. lodash 4.18.0 "Bad release") even when
  // the current version is fine. null when the target version is not deprecated.
  latestDeprecated: z.string().nullable(),
  vulnerabilities: z.array(VulnerabilitySchema),
  changelogText: z.string(),
  changelogSource: ChangelogSourceSchema,
  // Human-readable note when the resolved changelog does not cover every major
  // version in the (current, latest] range — null when coverage is complete or
  // the gap can't be determined. Passed to Claude so it flags the gap instead of
  // silently presenting a partial history as complete.
  coverageGap: z.string().nullable(),
})

// ─── Input: the parsed package.json dependency maps ───────────────────────

export const DependencyMapSchema = z.record(z.string(), z.string())

export const PackageJsonInputSchema = z.object({
  dependencies: DependencyMapSchema.optional(),
  devDependencies: DependencyMapSchema.optional(),
  peerDependencies: DependencyMapSchema.optional(),
})

export const AnalyzeRequestSchema = z.object({
  packageJson: PackageJsonInputSchema,
  includeDevDependencies: z.boolean().default(false),
})

export const RetryRequestSchema = z.object({
  name: z.string().min(1),
  versionRange: z.string().min(1),
})

// ─── Per-package state in the Zustand store ───────────────────────────────

export const PackageStateSchema = z.object({
  name: z.string().min(1),
  currentVersion: z.string(),
  status: PackageStatusSchema,
  analysis: PackageAnalysisSchema.nullable(),
  error: z.string().nullable(),
})

export const AnalysisSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
})

// ─── SSE event schemas ────────────────────────────────────────────────────

export const SseStartedPayloadSchema = z.object({
  total: z.number().int().nonnegative(),
})

export const SsePackageDonePayloadSchema = z.object({
  name: z.string().min(1),
  analysis: PackageAnalysisSchema,
})

export const SseErrorPayloadSchema = z.object({
  name: z.string().min(1).optional(),
  message: z.string(),
})

export const SseDonePayloadSchema = z.object({
  total: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

export const SseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), data: SseStartedPayloadSchema }),
  z.object({ type: z.literal('package-done'), data: SsePackageDonePayloadSchema }),
  z.object({ type: z.literal('error'), data: SseErrorPayloadSchema }),
  z.object({ type: z.literal('done'), data: SseDonePayloadSchema }),
])

// ─── npm registry packument (fields we actually use) ─────────────────────

export const NpmPackumentSchema = z.object({
  name: z.string(),
  'dist-tags': z.object({
    latest: z.string(),
  }),
  versions: z.record(
    z.string(),
    z.object({
      version: z.string(),
      repository: z
        .object({
          type: z.string().optional(),
          url: z.string(),
        })
        .optional(),
      // npm registry sometimes returns `deprecated: true` (no reason text)
      // instead of the usual deprecation-message string — accept both.
      deprecated: z.union([z.string(), z.boolean()]).optional(),
    }),
  ),
})

// ─── npm bulk advisories raw record ──────────────────────────────────────

export const NpmAdvisorySchema = z.object({
  id: z.number(),
  url: z.string().url().optional(),
  title: z.string(),
  severity: z.enum(['critical', 'high', 'moderate', 'low']),
  vulnerable_versions: z.string(),
})

export const NpmBulkAdvisoriesResponseSchema = z.record(z.string(), z.array(NpmAdvisorySchema))

// ─── GitHub API (fields we actually use) ──────────────────────────────────

export const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
  body: z.string().nullable(),
})

export const GitHubReleasesResponseSchema = z.array(GitHubReleaseSchema)

export const GitHubContentsResponseSchema = z.object({
  content: z.string(),
  encoding: z.string(),
})

// ─── OSV.dev vulnerability record (fields we actually use) ───────────────

export const OsvVulnerabilitySchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  // GitHub/OSV expose a ready-made severity bucket here (LOW/MODERATE/HIGH/
  // CRITICAL); the `severity` array below is a CVSS vector string, not a number.
  database_specific: z
    .object({
      severity: z.string().optional(),
    })
    .optional(),
  severity: z
    .array(
      z.object({
        type: z.string(),
        score: z.string(),
      }),
    )
    .optional(),
  affected: z
    .array(
      z.object({
        ranges: z
          .array(
            z.object({
              type: z.string(),
              events: z.array(
                z.object({
                  introduced: z.string().optional(),
                  fixed: z.string().optional(),
                }),
              ),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  references: z
    .array(
      z.object({
        type: z.string(),
        url: z.string().url(),
      }),
    )
    .optional(),
})

export const OsvQueryResponseSchema = z.object({
  vulns: z.array(OsvVulnerabilitySchema).optional(),
})
