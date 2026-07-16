// @vitest-environment jsdom
import { stubVirtualizerViewport } from '@/test/stubVirtualizer'
import type { PackageState } from '@/types'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { PackageList } from '@/components/PackageList/PackageList'

beforeEach(() => {
  stubVirtualizerViewport()
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
