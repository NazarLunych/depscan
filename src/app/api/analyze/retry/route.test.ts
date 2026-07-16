// @vitest-environment node
import type { AnalyzerResult } from '@/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzePackage } from '@/lib/analyzer'
import { fetchBulkAdvisories } from '@/lib/npmRegistry'
import { isRateLimited } from '@/lib/rateLimiter'
import { POST } from './route'

vi.mock('@/lib/analyzer', () => ({
  analyzePackage: vi.fn(),
}))

vi.mock('@/lib/npmRegistry', () => ({
  fetchBulkAdvisories: vi.fn(),
}))

vi.mock('@/lib/rateLimiter', () => ({
  getClientId: () => 'test-client',
  isRateLimited: vi.fn(),
}))

const mockAnalyzePackage = vi.mocked(analyzePackage)
const mockFetchBulkAdvisories = vi.mocked(fetchBulkAdvisories)
const mockIsRateLimited = vi.mocked(isRateLimited)

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/analyze/retry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const doneResult: AnalyzerResult = {
  status: 'done',
  name: 'react',
  currentVersion: '18.2.0',
  analysis: {
    package: 'react',
    current_version: '18.2.0',
    target_version: '19.0.0',
    breaking_changes: [],
    migration_steps: [],
    security_risks: 'none',
    roi: 'low',
    highlight: 'none',
  },
}

describe('POST /api/analyze/retry', () => {
  beforeEach(() => {
    mockAnalyzePackage.mockReset()
    mockFetchBulkAdvisories.mockReset()
    mockIsRateLimited.mockReset()
    mockIsRateLimited.mockReturnValue(false)
    mockFetchBulkAdvisories.mockResolvedValue([])
  })

  it('returns 429 when rate limited', async () => {
    mockIsRateLimited.mockReturnValue(true)

    const response = await POST(buildRequest({ name: 'react', versionRange: '^18.2.0' }))

    expect(response.status).toBe(429)
    expect(mockAnalyzePackage).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid body', async () => {
    const response = await POST(buildRequest({ name: '' }))

    expect(response.status).toBe(400)
    expect(mockAnalyzePackage).not.toHaveBeenCalled()
  })

  it('returns 400 instead of throwing for malformed JSON', async () => {
    const request = new Request('http://localhost/api/analyze/retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockAnalyzePackage).not.toHaveBeenCalled()
  })

  it('fetches advisories for just the one package and returns the analyzer result', async () => {
    mockAnalyzePackage.mockResolvedValue(doneResult)

    const response = await POST(buildRequest({ name: 'react', versionRange: '^18.2.0' }))
    const body = await response.json()

    expect(mockFetchBulkAdvisories).toHaveBeenCalledWith({ react: '^18.2.0' }, expect.anything())
    expect(mockAnalyzePackage).toHaveBeenCalledWith('react', '^18.2.0', [], expect.anything())
    expect(body).toEqual(doneResult)
  })
})
