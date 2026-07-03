// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { searchChangelog } from '@/lib/exaSearch'

// ─── Mock exa-js ──────────────────────────────────────────────────────────────

const mockSearch = vi.fn()

vi.mock('exa-js', () => ({
  default: vi.fn().mockImplementation(() => ({
    search: mockSearch,
  })),
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('searchChangelog', () => {
  beforeEach(() => {
    vi.stubEnv('EXA_API_KEY', 'test-key-123')
    mockSearch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null when EXA_API_KEY is not set', async () => {
    vi.stubEnv('EXA_API_KEY', '')

    expect(await searchChangelog('react', '18.0.0')).toBeNull()
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('concatenates text from multiple results with separator', async () => {
    mockSearch.mockResolvedValue({
      results: [
        { text: 'Section A about migration' },
        { text: 'Section B about breaking changes' },
        { text: 'Section C about new APIs' },
      ],
    })

    const result = await searchChangelog('react', '18.0.0')

    expect(result).toBe(
      'Section A about migration\n\n---\n\nSection B about breaking changes\n\n---\n\nSection C about new APIs',
    )
  })

  it('filters out results with no text', async () => {
    mockSearch.mockResolvedValue({
      results: [{ text: 'Useful content here' }, { text: '' }, { text: undefined }],
    })

    const result = await searchChangelog('react', '18.0.0')
    expect(result).toBe('Useful content here')
  })

  it('returns null when all results have no text', async () => {
    mockSearch.mockResolvedValue({
      results: [{ text: '' }, { text: undefined }],
    })

    expect(await searchChangelog('react', '18.0.0')).toBeNull()
  })

  it('returns null when results array is empty', async () => {
    mockSearch.mockResolvedValue({ results: [] })

    expect(await searchChangelog('react', '18.0.0')).toBeNull()
  })

  it('returns null when SDK throws', async () => {
    mockSearch.mockRejectedValue(new Error('Exa API error'))

    expect(await searchChangelog('react', '18.0.0')).toBeNull()
  })

  it('uses correct query format', async () => {
    mockSearch.mockResolvedValue({ results: [] })

    await searchChangelog('@emotion/react', '11.11.0')

    expect(mockSearch).toHaveBeenCalledWith(
      '@emotion/react v11.11.0 migration changelog',
      expect.objectContaining({ numResults: 3 }),
    )
  })
})
