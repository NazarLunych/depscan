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

const selectClassName =
  'rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300'

export const FilterSortToolbar = memo(function FilterSortToolbar({
  filter,
  sort,
  onFilterChange,
  onSortChange,
}: FilterSortToolbarProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-zinc-400">
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

      <label className="flex items-center gap-2 text-sm text-zinc-400">
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
