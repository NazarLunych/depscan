// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyTheme, getStoredTheme, THEME_STORAGE_KEY } from '@/lib/theme'

function mockPrefersDark(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, media: '', addEventListener: vi.fn() }),
  )
}

describe('getStoredTheme', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the stored theme when present and valid', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    mockPrefersDark(true)

    expect(getStoredTheme()).toBe('light')
  })

  it('falls back to prefers-color-scheme when nothing is stored', () => {
    mockPrefersDark(true)

    expect(getStoredTheme()).toBe('dark')

    mockPrefersDark(false)

    expect(getStoredTheme()).toBe('light')
  })

  it('ignores an invalid stored value and falls back to prefers-color-scheme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    mockPrefersDark(false)

    expect(getStoredTheme()).toBe('light')
  })
})

describe('applyTheme', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('adds the dark class and persists the choice', () => {
    applyTheme('dark')

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('removes the dark class and persists the choice', () => {
    document.documentElement.classList.add('dark')

    applyTheme('light')

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
