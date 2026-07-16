import { vi } from 'vitest'

// jsdom never lays anything out and has no ResizeObserver, so
// @tanstack/react-virtual's observeElementRect would see a zero-size
// viewport and render nothing. Call from a beforeEach in any test that
// renders PackageList (directly or via a page-level composition).
export function stubVirtualizerViewport(height = 600): void {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: height,
  })

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
}
