import '@testing-library/jest-dom/vitest'

// jsdom has no matchMedia implementation at all — stub a "light" default so
// any component reading prefers-color-scheme (e.g. ThemeToggle via
// getStoredTheme) doesn't crash in tests that don't care about theming.
// Tests that do care (theme.test.ts, ThemeToggle.test.tsx) override this
// with their own vi.stubGlobal('matchMedia', ...) per case.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
