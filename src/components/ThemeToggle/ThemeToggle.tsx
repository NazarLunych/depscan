'use client'

import { memo, useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'

import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme'

export const ThemeToggle = memo(function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    // SSR can't know localStorage's value — the boot script in layout.tsx
    // already applied the right class before hydration, so this only
    // corrects the toggle's own label, not any actual rendered colors.
    setTheme(getStoredTheme())
  }, [])

  const toggle = (): void => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'

    setTheme(next)
    applyTheme(next)
  }

  return (
    <Button variant="secondary" onClick={toggle} aria-label="Toggle color theme">
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </Button>
  )
})
