// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { processBatch } from '@/lib/batchProcessor'

// ─── Mock the Anthropic SDK — real analyzer/claudeClient/npmRegistry/osvApi/
// changelogExtractor wiring runs against a faked `fetch` and a faked model call ──

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

function mockAnalysisFor(packageName: string, overrides: Record<string, unknown> = {}) {
  return {
    content: [
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'record_package_analysis',
        input: {
          package: packageName,
          current_version: '1.0.0',
          target_version: '2.0.0',
          breaking_changes: ['Some breaking change'],
          migration_steps: ['Update usage'],
          security_risks: 'none',
          roi: 'middle',
          highlight: 'yellow',
          ...overrides,
        },
      },
    ],
  }
}

// ─── npm registry fixtures ────────────────────────────────────────────────────

function makePackument(
  name: string,
  opts: {
    latest?: string
    deprecated?: string
    latestDeprecated?: string
    repositoryUrl?: string
  } = {},
) {
  const latest = opts.latest ?? '2.0.0'

  return {
    name,
    'dist-tags': { latest },
    versions: {
      '1.0.0': {
        version: '1.0.0',
        ...(opts.repositoryUrl && { repository: { type: 'git', url: opts.repositoryUrl } }),
        ...(opts.deprecated && { deprecated: opts.deprecated }),
      },
      [latest]: {
        version: latest,
        ...(opts.latestDeprecated && { deprecated: opts.latestDeprecated }),
      },
    },
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('analyzer + batchProcessor integration', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    vi.stubEnv('EXA_API_KEY', '')
    mockFetch.mockReset()
    mockCreate.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('analyzes a mixed package.json: normal, scoped, 404, deprecated, advisory, and no-changelog', async () => {
    const packageJson = {
      dependencies: {
        react: '^1.0.0',
        '@scope/pkg': '^1.0.0',
        'missing-pkg': '^1.0.0',
        'deprecated-pkg': '^1.0.0',
        'vulnerable-pkg': '^1.0.0',
        'no-changelog-pkg': '^1.0.0',
      },
    }

    mockFetch.mockImplementation(async (input: string | URL) => {
      const url = String(input)

      if (url.includes('/-/npm/v1/security/advisories/bulk')) {
        return jsonResponse({
          'vulnerable-pkg': [
            {
              id: 1001,
              title: 'Test vulnerability',
              severity: 'high',
              vulnerable_versions: '<2.0.0',
            },
          ],
        })
      }

      if (url.includes('api.osv.dev')) {
        return jsonResponse({ vulns: [] })
      }

      if (url.includes('registry.npmjs.org/missing-pkg')) {
        return new Response(null, { status: 404 })
      }

      if (url.includes('registry.npmjs.org/deprecated-pkg')) {
        return jsonResponse(makePackument('deprecated-pkg', { deprecated: 'use something else' }))
      }

      if (url.includes('registry.npmjs.org/%40scope%2Fpkg')) {
        return jsonResponse(makePackument('@scope/pkg'))
      }

      if (url.includes('registry.npmjs.org/react')) {
        return jsonResponse(makePackument('react'))
      }

      if (url.includes('registry.npmjs.org/vulnerable-pkg')) {
        return jsonResponse(makePackument('vulnerable-pkg'))
      }

      if (url.includes('registry.npmjs.org/no-changelog-pkg')) {
        return jsonResponse(makePackument('no-changelog-pkg'))
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    mockCreate.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
      const userContent = params.messages[0]?.content ?? ''
      const match = /"packageName":\s*"([^"]+)"/.exec(userContent)
      const name = match?.[1] ?? 'unknown'

      return mockAnalysisFor(name)
    })

    const results = await processBatch(packageJson, false)

    expect(results).toHaveLength(6)

    const byName = Object.fromEntries(results.map((r) => [r.name, r]))

    expect(byName['react']?.status).toBe('done')
    expect(byName['@scope/pkg']?.status).toBe('done')
    expect(byName['deprecated-pkg']?.status).toBe('done')
    expect(byName['vulnerable-pkg']?.status).toBe('done')
    expect(byName['no-changelog-pkg']?.status).toBe('done')

    expect(byName['missing-pkg']?.status).toBe('error')

    if (byName['missing-pkg']?.status === 'error') {
      expect(byName['missing-pkg'].error).toContain('package not found')
    }

    if (byName['react']?.status === 'done') {
      expect(byName['react'].analysis.highlight).toBe('yellow')
      expect(byName['react'].analysis.roi).toBe('middle')
    }

    // bulk-advisories fetched exactly once for the whole batch
    const bulkAdvisoryCalls = mockFetch.mock.calls.filter(([input]) =>
      String(input).includes('/-/npm/v1/security/advisories/bulk'),
    )

    expect(bulkAdvisoryCalls).toHaveLength(1)
  })

  it('passes latestDeprecated to Claude when the target version is a bad release', async () => {
    const packageJson = { dependencies: { 'bad-latest-pkg': '^1.0.0' } }

    mockFetch.mockImplementation(async (input: string | URL) => {
      const url = String(input)

      if (url.includes('/-/npm/v1/security/advisories/bulk')) return jsonResponse({})

      if (url.includes('api.osv.dev')) return jsonResponse({ vulns: [] })

      if (url.includes('registry.npmjs.org/bad-latest-pkg')) {
        return jsonResponse(
          makePackument('bad-latest-pkg', { latestDeprecated: 'Bad release. Use 1.9.9 instead.' }),
        )
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    let capturedPrompt = ''

    mockCreate.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
      capturedPrompt = params.messages[0]?.content ?? ''

      return mockAnalysisFor('bad-latest-pkg')
    })

    await processBatch(packageJson, false)

    const facts = JSON.parse(/(\{[\s\S]*\})/.exec(capturedPrompt)?.[1] ?? '{}')

    expect(facts.latestDeprecated).toBe('Bad release. Use 1.9.9 instead.')
    expect(facts.deprecated).toBeNull()
  })

  it('normalizes a boolean `deprecated: true` from the npm registry instead of failing', async () => {
    const packageJson = { dependencies: { 'bool-deprecated-pkg': '^1.0.0' } }

    mockFetch.mockImplementation(async (input: string | URL) => {
      const url = String(input)

      if (url.includes('/-/npm/v1/security/advisories/bulk')) return jsonResponse({})

      if (url.includes('api.osv.dev')) return jsonResponse({ vulns: [] })

      if (url.includes('registry.npmjs.org/bool-deprecated-pkg')) {
        return jsonResponse({
          name: 'bool-deprecated-pkg',
          'dist-tags': { latest: '2.0.0' },
          versions: {
            '1.0.0': { version: '1.0.0', deprecated: true },
            '2.0.0': { version: '2.0.0' },
          },
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    let capturedPrompt = ''

    mockCreate.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
      capturedPrompt = params.messages[0]?.content ?? ''

      return mockAnalysisFor('bool-deprecated-pkg')
    })

    const results = await processBatch(packageJson, false)

    expect(results[0]?.status).toBe('done')

    const facts = JSON.parse(/(\{[\s\S]*\})/.exec(capturedPrompt)?.[1] ?? '{}')

    expect(facts.deprecated).toBe('deprecated')
  })

  it('returns a human-readable error instead of raw Zod JSON when Claude output fails validation', async () => {
    const packageJson = { dependencies: { 'truncated-pkg': '^1.0.0' } }

    mockFetch.mockImplementation(async (input: string | URL) => {
      const url = String(input)

      if (url.includes('/-/npm/v1/security/advisories/bulk')) return jsonResponse({})

      if (url.includes('api.osv.dev')) return jsonResponse({ vulns: [] })

      if (url.includes('registry.npmjs.org/truncated-pkg')) {
        return jsonResponse(makePackument('truncated-pkg'))
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    // Simulates a truncated/malformed tool_use input (e.g. hit max_tokens) —
    // required fields missing, which is what triggers ZodError in claudeClient.
    mockCreate.mockImplementation(async () => ({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'record_package_analysis',
          input: { package: 'truncated-pkg', current_version: '1.0.0' },
        },
      ],
    }))

    const results = await processBatch(packageJson, false)

    expect(results[0]?.status).toBe('error')

    if (results[0]?.status === 'error') {
      expect(results[0].error).not.toContain('"code"')
      expect(results[0].error).not.toContain('invalid_type')
      expect(results[0].error).toContain('truncated-pkg')
    }
  })
})
