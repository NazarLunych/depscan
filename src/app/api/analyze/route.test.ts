// @vitest-environment node
import type { AnalyzerResult } from '@/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as BatchProcessorModule from '@/lib/batchProcessor'
import { processBatch } from '@/lib/batchProcessor'
import { POST } from './route'

vi.mock('@/lib/batchProcessor', async () => {
  const actual = await vi.importActual<typeof BatchProcessorModule>('@/lib/batchProcessor')

  return {
    ...actual,
    processBatch: vi.fn(),
  }
})

const mockProcessBatch = vi.mocked(processBatch)

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readAllEvents(response: Response): Promise<Array<{ type: string; data: unknown }>> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const events: Array<{ type: string; data: unknown }> = []

  for (;;) {
    const { done, value } = await reader.read()

    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')

    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary)

      buffer = buffer.slice(boundary + 2)

      if (!chunk.startsWith(':')) {
        const typeLine = chunk.split('\n').find((line) => line.startsWith('event: '))

        const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '))

        if (typeLine && dataLine) {
          events.push({
            type: typeLine.slice('event: '.length),
            data: JSON.parse(dataLine.slice('data: '.length)),
          })
        }
      }

      boundary = buffer.indexOf('\n\n')
    }
  }

  return events
}

const doneResult = (name: string) =>
  ({
    status: 'done',
    name,
    currentVersion: '1.0.0',
    analysis: {
      package: name,
      current_version: '1.0.0',
      target_version: '2.0.0',
      breaking_changes: [],
      migration_steps: [],
      security_risks: 'none',
      roi: 'low',
      highlight: 'none',
    },
  }) satisfies AnalyzerResult

const errorResult = (name: string): AnalyzerResult => ({
  status: 'error',
  name,
  currentVersion: null,
  error: 'boom',
})

describe('POST /api/analyze', () => {
  beforeEach(() => {
    mockProcessBatch.mockReset()
  })

  it('returns 400 for an invalid request body', async () => {
    const response = await POST(buildRequest({ packageJson: 'not-an-object' }))

    expect(response.status).toBe(400)
    expect(mockProcessBatch).not.toHaveBeenCalled()
  })

  it('returns 400 instead of throwing for a malformed JSON body', async () => {
    const request = new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockProcessBatch).not.toHaveBeenCalled()
  })

  it('streams started, package-done and done events for a successful batch', async () => {
    const react = doneResult('react')

    mockProcessBatch.mockImplementation(async (packageJson, includeDev, onResult) => {
      const results = [react]

      results.forEach((r) => onResult?.(r))

      return results
    })

    const response = await POST(
      buildRequest({
        packageJson: { dependencies: { react: '^18.2.0' } },
        includeDevDependencies: false,
      }),
    )
    const events = await readAllEvents(response)

    expect(events[0]).toEqual({ type: 'started', data: { total: 1 } })
    expect(events[1]).toEqual({
      type: 'package-done',
      data: { name: 'react', analysis: react.analysis },
    })
    expect(events[2]).toEqual({ type: 'done', data: { total: 1, failed: 0 } })
  })

  it('streams an error event with name for a failed package and counts it in done', async () => {
    mockProcessBatch.mockImplementation(async (packageJson, includeDev, onResult) => {
      const results = [errorResult('left-pad')]

      results.forEach((r) => onResult?.(r))

      return results
    })

    const response = await POST(
      buildRequest({
        packageJson: { dependencies: { 'left-pad': '^1.0.0' } },
        includeDevDependencies: false,
      }),
    )
    const events = await readAllEvents(response)

    expect(events).toContainEqual({ type: 'error', data: { name: 'left-pad', message: 'boom' } })
    expect(events.at(-1)).toEqual({ type: 'done', data: { total: 1, failed: 1 } })
  })

  it('streams a name-less error event and skips done when processBatch throws', async () => {
    mockProcessBatch.mockRejectedValue(new Error('fatal failure'))

    const response = await POST(
      buildRequest({
        packageJson: { dependencies: { react: '^18.2.0' } },
        includeDevDependencies: false,
      }),
    )
    const events = await readAllEvents(response)

    expect(events).toContainEqual({ type: 'error', data: { message: 'fatal failure' } })
    expect(events.some((e) => e.type === 'done')).toBe(false)
  })

  it('sends started with total 0 and done immediately for an empty package.json', async () => {
    mockProcessBatch.mockResolvedValue([])

    const response = await POST(buildRequest({ packageJson: {}, includeDevDependencies: false }))
    const events = await readAllEvents(response)

    expect(events).toEqual([
      { type: 'started', data: { total: 0 } },
      { type: 'done', data: { total: 0, failed: 0 } },
    ])
  })
})
