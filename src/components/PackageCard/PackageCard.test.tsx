// @vitest-environment jsdom
import type { PackageState } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PackageCard } from '@/components/PackageCard/PackageCard'

const basePackage: PackageState = {
  name: 'react',
  currentVersion: '^18.2.0',
  status: 'pending',
  analysis: null,
  error: null,
}

describe('PackageCard', () => {
  it('renders a skeleton while pending', () => {
    render(<PackageCard pkg={{ ...basePackage, status: 'pending' }} />)

    expect(screen.getByTestId('package-card-skeleton')).toBeInTheDocument()
  })

  it('renders a skeleton while analyzing', () => {
    render(<PackageCard pkg={{ ...basePackage, status: 'analyzing' }} />)

    expect(screen.getByTestId('package-card-skeleton')).toBeInTheDocument()
  })

  it('does not render a skeleton once errored', () => {
    render(<PackageCard pkg={{ ...basePackage, status: 'error', error: 'boom' }} />)

    expect(screen.queryByTestId('package-card-skeleton')).not.toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })

  it('does not render a skeleton once done', () => {
    render(
      <PackageCard
        pkg={{
          ...basePackage,
          status: 'done',
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
        }}
      />,
    )

    expect(screen.queryByTestId('package-card-skeleton')).not.toBeInTheDocument()
  })
})
