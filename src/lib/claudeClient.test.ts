// @vitest-environment node
import type { HardFacts } from '@/types'
import type * as AnthropicModule from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', async () => {
  const actual = await vi.importActual<typeof AnthropicModule>('@anthropic-ai/sdk')

  return {
    ...actual,
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  }
})

const { callClaude } = await import('@/lib/claudeClient')
const { APIError } = await import('@anthropic-ai/sdk')

function toolUseResponse(input: Record<string, unknown>) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'record_package_analysis', input }],
  }
}

const validInput = {
  package: 'react',
  current_version: '17.0.2',
  target_version: '18.2.0',
  breaking_changes: [],
  migration_steps: [],
  security_risks: 'none',
  roi: 'middle',
  highlight: 'yellow',
}
const facts: HardFacts = {
  packageName: 'react',
  currentVersion: '17.0.2',
  latestVersion: '18.2.0',
  deprecated: null,
  latestDeprecated: null,
  vulnerabilities: [],
  changelogText: '',
  changelogSource: 'none',
  coverageGap: null,
}

describe('callClaude', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns the parsed analysis on the first successful attempt', async () => {
    mockCreate.mockResolvedValueOnce(toolUseResponse(validInput))

    const result = await callClaude(facts)

    expect(result.package).toBe('react')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('retries once when the response has no tool_use block, then throws if still bad', async () => {
    mockCreate.mockResolvedValue({ content: [] })

    await expect(callClaude(facts)).rejects.toThrow('no tool_use block')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('retries once on a schema-invalid tool_use input and succeeds on the second attempt', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse({ package: 'react' }))
      .mockResolvedValueOnce(toolUseResponse(validInput))

    const result = await callClaude(facts)

    expect(result.package).toBe('react')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('does not retry when the SDK throws an APIError (SDK already retried internally)', async () => {
    mockCreate.mockRejectedValueOnce(
      new APIError(429, { type: 'rate_limit_error' }, 'Rate limited', new Headers()),
    )

    await expect(callClaude(facts)).rejects.toBeInstanceOf(APIError)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})
