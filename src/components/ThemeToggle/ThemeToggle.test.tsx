// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle'

import { THEME_STORAGE_KEY } from '@/lib/theme'

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, media: '', addEventListener: vi.fn() }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('labels itself for switching to light mode when the stored theme is dark', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    render(<ThemeToggle />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Toggle color theme' })).toHaveTextContent(
        'Light mode',
      )
    })
  })

  it('toggles the theme and flips its own label when clicked', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    render(<ThemeToggle />)

    const button = screen.getByRole('button', { name: 'Toggle color theme' })

    await waitFor(() => expect(button).toHaveTextContent('Light mode'))

    fireEvent.click(button)

    expect(button).toHaveTextContent('Dark mode')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
