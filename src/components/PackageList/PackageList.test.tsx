// @vitest-environment jsdom
import type { PackageState } from '@/types'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PackageList } from '@/components/PackageList/PackageList'

const VIEWPORT_HEIGHT = 600

// jsdom never lays anything out, so every element reports zero size and has
// no ResizeObserver — the virtualizer's observeElementRect reads
// offsetWidth/offsetHeight synchronously on mount and bails out entirely
// without a ResizeObserver constructor. Stub both so it sees a realistic,
// non-zero scrollable viewport to compute visible rows against.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: VIEWPORT_HEIGHT,
  })

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

function buildPackages(count: number): { order: string[]; packages: Record<string, PackageState> } {
  const order: string[] = []
  const packages: Record<string, PackageState> = {}

  for (let i = 0; i < count; i++) {
    const name = `pkg-${i}`

    order.push(name)
    packages[name] = {
      name,
      currentVersion: '^1.0.0',
      status: 'pending',
      analysis: null,
      error: null,
    }
  }

  return { order, packages }
}

describe('PackageList', () => {
  it('renders a card for each package in a small list', () => {
    const { order, packages } = buildPackages(3)

    render(<PackageList order={order} packages={packages} />)

    expect(screen.getByText('pkg-0')).toBeInTheDocument()
    expect(screen.getByText('pkg-1')).toBeInTheDocument()
    expect(screen.getByText('pkg-2')).toBeInTheDocument()
  })

  it('only mounts a subset of cards for a large list (virtualization is active)', () => {
    const { order, packages } = buildPackages(500)
    const { container } = render(<PackageList order={order} packages={packages} />)
    const mountedRows = container.querySelectorAll('[data-index]')

    expect(mountedRows.length).toBeGreaterThan(0)
    expect(mountedRows.length).toBeLessThan(order.length)
  })
})
