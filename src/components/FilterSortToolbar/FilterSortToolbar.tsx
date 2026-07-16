import { memo } from 'react'

import {
  parseHighlightFilter,
  parseSortMode,
  type HighlightFilter,
  type SortMode,
} from '@/lib/packageOrdering'

interface FilterSortToolbarProps {
  filter: HighlightFilter
  sort: SortMode
  onFilterChange: (filter: HighlightFilter) => void
  onSortChange: (sort: SortMode) => void
}

const selectClassName = 'rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-fg'

export const FilterSortToolbar = memo(function FilterSortToolbar({
  filter,
  sort,
  onFilterChange,
  onSortChange,
}: FilterSortToolbarProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-muted flex items-center gap-2 text-sm">
        Filter
        <select
          value={filter}
          onChange={(event) => onFilterChange(parseHighlightFilter(event.target.value))}
          className={selectClassName}
        >
          <option value="all">All</option>
          <option value="red">Upgrade required</option>
          <option value="yellow">Upgrade recommended</option>
          <option value="none">Up to date</option>
        </select>
      </label>

      <label className="text-muted flex items-center gap-2 text-sm">
        Sort
        <select
          value={sort}
          onChange={(event) => onSortChange(parseSortMode(event.target.value))}
          className={selectClassName}
        >
          <option value="default">Default</option>
          <option value="roi">ROI</option>
          <option value="highlight">Highlight</option>
        </select>
      </label>
    </div>
  )
})
