import type { HardFacts, PackageAnalysis } from '@/types'
import Anthropic from '@anthropic-ai/sdk'

import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompts'
import { PackageAnalysisSchema } from '@/lib/schemas'

const client = new Anthropic()
const MODEL = 'claude-sonnet-4-6'
const TOOL_NAME = 'record_package_analysis'
// Hand-synced to PackageAnalysisSchema (src/lib/schemas.ts) — no zod-to-json-schema
// dependency in this project, so keep the two in lockstep manually.
const PACKAGE_ANALYSIS_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    package: { type: 'string' },
    current_version: { type: 'string' },
    target_version: { type: 'string' },
    breaking_changes: { type: 'array', items: { type: 'string' } },
    migration_steps: { type: 'array', items: { type: 'string' } },
    security_risks: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
    roi: { type: 'string', enum: ['low', 'middle', 'high'] },
    highlight: { type: 'string', enum: ['red', 'yellow', 'none'] },
  },
  required: [
    'package',
    'current_version',
    'target_version',
    'breaking_changes',
    'migration_steps',
    'security_risks',
    'roi',
    'highlight',
  ],
  additionalProperties: false,
}

async function attempt(facts: HardFacts): Promise<PackageAnalysis> {
  const response = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(facts) }],
      tools: [
        {
          name: TOOL_NAME,
          description: 'Record the structured upgrade verdict for this package.',
          input_schema: PACKAGE_ANALYSIS_TOOL_SCHEMA,
          strict: true,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    },
    { timeout: 30_000 },
  )
  const toolUseBlock = response.content.find((block) => block.type === 'tool_use')

  if (!toolUseBlock) {
    throw new Error('Claude response contained no tool_use block')
  }

  const result = PackageAnalysisSchema.safeParse(toolUseBlock.input)

  if (!result.success) {
    throw new Error(`Claude output failed schema validation: ${result.error.message}`)
  }

  return result.data
}

export async function callClaude(facts: HardFacts): Promise<PackageAnalysis> {
  try {
    return await attempt(facts)
  } catch (err) {
    console.error(`[claudeClient] first attempt failed for "${facts.packageName}", retrying:`, err)

    return await attempt(facts)
  }
}
