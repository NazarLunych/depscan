import type { z } from 'zod'

import type {
  AnalysisSummarySchema,
  AnalyzeRequestSchema,
  AnalyzerResultSchema,
  ChangelogSourceSchema,
  DependencyMapSchema,
  HardFactsSchema,
  HighlightSchema,
  NpmAdvisorySchema,
  NpmPackumentSchema,
  OsvQueryResponseSchema,
  OsvVulnerabilitySchema,
  PackageAnalysisSchema,
  PackageJsonInputSchema,
  PackageStateSchema,
  PackageStatusSchema,
  RetryRequestSchema,
  RoiSchema,
  SecurityRiskSchema,
  SseDonePayloadSchema,
  SseErrorPayloadSchema,
  SseEventSchema,
  SseEventTypeSchema,
  SsePackageDonePayloadSchema,
  SseStartedPayloadSchema,
  VulnerabilitySchema,
} from '@/lib/schemas'

// ─── Primitive literals ────────────────────────────────────────────────────

export type Highlight = z.infer<typeof HighlightSchema>
export type Roi = z.infer<typeof RoiSchema>
export type SecurityRisk = z.infer<typeof SecurityRiskSchema>
export type ChangelogSource = z.infer<typeof ChangelogSourceSchema>
export type PackageStatus = z.infer<typeof PackageStatusSchema>
export type SseEventType = z.infer<typeof SseEventTypeSchema>

// ─── Domain entities ──────────────────────────────────────────────────────

export type PackageAnalysis = z.infer<typeof PackageAnalysisSchema>
export type AnalyzerResult = z.infer<typeof AnalyzerResultSchema>
export type Vulnerability = z.infer<typeof VulnerabilitySchema>
export type HardFacts = z.infer<typeof HardFactsSchema>
export type PackageState = z.infer<typeof PackageStateSchema>
export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>

// ─── Input schemas ────────────────────────────────────────────────────────

export type DependencyMap = z.infer<typeof DependencyMapSchema>
export type PackageJsonInput = z.infer<typeof PackageJsonInputSchema>
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>
export type RetryRequest = z.infer<typeof RetryRequestSchema>

// ─── SSE events ───────────────────────────────────────────────────────────

export type SseStartedPayload = z.infer<typeof SseStartedPayloadSchema>
export type SsePackageDonePayload = z.infer<typeof SsePackageDonePayloadSchema>
export type SseErrorPayload = z.infer<typeof SseErrorPayloadSchema>
export type SseDonePayload = z.infer<typeof SseDonePayloadSchema>
export type SseEvent = z.infer<typeof SseEventSchema>

// ─── External API response shapes ────────────────────────────────────────

export type NpmPackument = z.infer<typeof NpmPackumentSchema>
export type NpmAdvisory = z.infer<typeof NpmAdvisorySchema>
export type OsvVulnerability = z.infer<typeof OsvVulnerabilitySchema>
export type OsvQueryResponse = z.infer<typeof OsvQueryResponseSchema>
