// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FilterSortToolbar } from '@/components/FilterSortToolbar/FilterSortToolbar'

describe('FilterSortToolbar', () => {
  it('calls onFilterChange with the selected value', () => {
    const onFilterChange = vi.fn()

    render(
      <FilterSortToolbar
        filter="all"
        sort="default"
        onFilterChange={onFilterChange}
        onSortChange={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'red' } })

    expect(onFilterChange).toHaveBeenCalledWith('red')
  })

  it('calls onSortChange with the selected value', () => {
    const onSortChange = vi.fn()

    render(
      <FilterSortToolbar
        filter="all"
        sort="default"
        onFilterChange={vi.fn()}
        onSortChange={onSortChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'roi' } })

    expect(onSortChange).toHaveBeenCalledWith('roi')
  })

  it('reflects the current filter and sort values', () => {
    render(
      <FilterSortToolbar
        filter="yellow"
        sort="highlight"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Filter')).toHaveValue('yellow')
    expect(screen.getByLabelText('Sort')).toHaveValue('highlight')
  })
})
