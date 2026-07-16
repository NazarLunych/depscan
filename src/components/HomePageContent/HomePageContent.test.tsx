// @vitest-environment jsdom
import { useAnalysisStore } from '@/stores/analysisStore'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomePageContent } from '@/components/HomePageContent/HomePageContent'

let currentSearch = ''
const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

describe('HomePageContent', () => {
  beforeEach(() => {
    currentSearch = ''
    replace.mockClear()
    useAnalysisStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pre-selects the filter and sort read from the URL on mount', () => {
    currentSearch = 'filter=red&sort=roi'
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }])
    useAnalysisStore.getState().markDone('react', {
      package: 'react',
      current_version: '18.2.0',
      target_version: '19.0.0',
      breaking_changes: [],
      migration_steps: [],
      security_risks: 'none',
      roi: 'low',
      highlight: 'red',
    })

    render(<HomePageContent />)

    expect(screen.getByLabelText('Filter')).toHaveValue('red')
    expect(screen.getByLabelText('Sort')).toHaveValue('roi')
  })

  it('falls back to defaults for unrecognized query values without throwing', () => {
    currentSearch = 'sort=bogus'
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }])

    render(<HomePageContent />)

    expect(screen.getByLabelText('Sort')).toHaveValue('default')
  })

  it('calls router.replace with the updated query string when the filter changes', () => {
    useAnalysisStore.getState().initPackages([{ name: 'react', versionRange: '^18.2.0' }])

    render(<HomePageContent />)
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'red' } })

    expect(replace).toHaveBeenCalledWith('?filter=red', { scroll: false })
  })
})
