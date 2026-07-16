// @vitest-environment jsdom
import { useAnalysisStore } from '@/stores/analysisStore'
import { stubVirtualizerViewport } from '@/test/stubVirtualizer'
import type { PackageAnalysis } from '@/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomePageContent } from '@/components/HomePageContent/HomePageContent'

// router.replace only changes the address bar in the real app — the actual
// re-render on navigation comes from Next re-invoking useSearchParams with
// the new params, which is out of scope for a component test. Simulate that
// step directly: replace() updates this holder, and the test calls rerender
// itself to observe the resulting view, exactly like a real navigation would.
let currentSearch = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (url: string) => {
      currentSearch = url.split('?')[1] ?? ''
    },
  }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

const analysis = (overrides: Partial<PackageAnalysis> = {}): PackageAnalysis => ({
  package: 'pkg',
  current_version: '1.0.0',
  target_version: '2.0.0',
  breaking_changes: [],
  migration_steps: [],
  security_risks: 'none',
  roi: 'low',
  highlight: 'none',
  ...overrides,
})

describe('HomePageContent interactions', () => {
  beforeEach(() => {
    currentSearch = ''
    useAnalysisStore.getState().reset()
    stubVirtualizerViewport()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('filtering reduces the visible cards to only the matching highlight', () => {
    const store = useAnalysisStore.getState()

    store.initPackages([
      { name: 'red-pkg', versionRange: '^1.0.0' },
      { name: 'yellow-pkg', versionRange: '^1.0.0' },
      { name: 'none-pkg', versionRange: '^1.0.0' },
    ])
    store.markDone('red-pkg', analysis({ package: 'red-pkg', highlight: 'red' }))
    store.markDone('yellow-pkg', analysis({ package: 'yellow-pkg', highlight: 'yellow' }))
    store.markDone('none-pkg', analysis({ package: 'none-pkg', highlight: 'none' }))

    const { rerender } = render(<HomePageContent />)

    expect(screen.getByText('red-pkg')).toBeInTheDocument()
    expect(screen.getByText('yellow-pkg')).toBeInTheDocument()
    expect(screen.getByText('none-pkg')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'red' } })
    rerender(<HomePageContent />)

    expect(screen.getByText('red-pkg')).toBeInTheDocument()
    expect(screen.queryByText('yellow-pkg')).not.toBeInTheDocument()
    expect(screen.queryByText('none-pkg')).not.toBeInTheDocument()
  })

  it('sorting by ROI reorders the rendered cards from high to low', () => {
    const store = useAnalysisStore.getState()

    store.initPackages([
      { name: 'low-pkg', versionRange: '^1.0.0' },
      { name: 'high-pkg', versionRange: '^1.0.0' },
      { name: 'middle-pkg', versionRange: '^1.0.0' },
    ])
    store.markDone('low-pkg', analysis({ package: 'low-pkg', roi: 'low' }))
    store.markDone('high-pkg', analysis({ package: 'high-pkg', roi: 'high' }))
    store.markDone('middle-pkg', analysis({ package: 'middle-pkg', roi: 'middle' }))

    const { rerender } = render(<HomePageContent />)

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'roi' } })
    rerender(<HomePageContent />)

    const names = screen.getAllByText(/-pkg$/).map((el) => el.textContent)

    expect(names).toEqual(['high-pkg', 'middle-pkg', 'low-pkg'])
  })

  it('cancel flips still-unsettled cards to Cancelled without setting a fatal error', () => {
    useAnalysisStore.getState().initPackages([
      { name: 'pending-pkg', versionRange: '^1.0.0' },
      { name: 'analyzing-pkg', versionRange: '^1.0.0' },
    ])
    useAnalysisStore.getState().markAnalyzing('analyzing-pkg')

    const { rerender } = render(<HomePageContent />)

    // cancelAnalysis only aborts the in-flight request's AbortController;
    // useAnalysis.test.ts already covers that wiring. Here there is no real
    // fetch in flight, so call the store action cancelAnalysis's abort
    // reactively triggers, and re-render to observe the resulting cards —
    // exactly what the component would show once that reaction completes.
    act(() => {
      useAnalysisStore.getState().cancel()
    })
    rerender(<HomePageContent />)

    const cancelledMessages = screen.getAllByText('Cancelled')

    expect(cancelledMessages).toHaveLength(2)
    expect(useAnalysisStore.getState().fatalError).toBeNull()
  })

  it('retry replaces an error card with the fresh analyzer result', async () => {
    useAnalysisStore.getState().initPackages([{ name: 'left-pad', versionRange: '^1.1.0' }])
    useAnalysisStore.getState().markError('left-pad', 'boom')

    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'done',
          name: 'left-pad',
          currentVersion: '1.3.0',
          analysis: analysis({ package: 'left-pad', target_version: '1.3.0' }),
        }),
      ),
    )

    render(<HomePageContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(screen.queryByText('boom')).not.toBeInTheDocument()
    })

    expect(screen.getByText((text) => text.includes('Target:'))).toBeInTheDocument()
    expect(screen.getByText('1.3.0', { exact: false })).toBeInTheDocument()
  })
})
