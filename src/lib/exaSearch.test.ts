// @vitest-environment node
import type * as ExaModule from 'exa-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { searchChangelog } from '@/lib/exaSearch'

// ─── Mock exa-js ──────────────────────────────────────────────────────────────

const mockSearch = vi.fn()

vi.mock('exa-js', async () => {
  const actual = await vi.importActual<typeof ExaModule>('exa-js')

  return {
    ...actual,
    default: vi.fn().mockImplementation(() => ({
      search: mockSearch,
    })),
  }
})

const { ExaError } = await import('exa-js')

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

  it('retries once on a 429 and returns the result from the second attempt', async () => {
    mockSearch
      .mockRejectedValueOnce(new ExaError('Rate limited', 429))
      .mockResolvedValueOnce({ results: [{ text: 'Migration guide content' }] })

    const result = await searchChangelog('react', '18.0.0')

    expect(result).toBe('Migration guide content')
    expect(mockSearch).toHaveBeenCalledTimes(2)
  })

  it('returns null after exhausting the retry on repeated 429s', async () => {
    mockSearch.mockRejectedValue(new ExaError('Rate limited', 429))

    expect(await searchChangelog('react', '18.0.0')).toBeNull()
    expect(mockSearch).toHaveBeenCalledTimes(2)
  })

  it('does not retry on a non-429 ExaError', async () => {
    mockSearch.mockRejectedValue(new ExaError('Server error', 500))

    expect(await searchChangelog('react', '18.0.0')).toBeNull()
    expect(mockSearch).toHaveBeenCalledTimes(1)
  })

  it('uses correct query format', async () => {
    mockSearch.mockResolvedValue({ results: [] })

    await searchChangelog('@emotion/react', '11.11.0')

    expect(mockSearch).toHaveBeenCalledWith(
      '@emotion/react v11.11.0 migration changelog',
      expect.objectContaining({ numResults: 3 }),
    )
  })

  it('rejects immediately when the signal is already aborted', async () => {
    mockSearch.mockResolvedValue({ results: [{ text: 'Migration guide content' }] })

    const controller = new AbortController()

    controller.abort()

    await expect(searchChangelog('react', '18.0.0', controller.signal)).rejects.toThrow(
      /aborted/i,
    )
  })

  it('rejects once the signal fires while a search is in flight', async () => {
    const controller = new AbortController()

    mockSearch.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ results: [] }), 50)),
    )

    const promise = searchChangelog('react', '18.0.0', controller.signal)

    queueMicrotask(() => controller.abort())

    await expect(promise).rejects.toThrow(/aborted/i)
  })
})
