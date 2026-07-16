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
  'cursor-pointer appearance-none rounded-lg border border-border bg-surface bg-no-repeat ' +
  'py-1.5 pr-7 pl-2 text-sm text-fg'
// Native <select> arrows are rendered by the browser at inconsistent
// positions we can't reach with CSS — appearance-none removes it, this
// draws a replacement pinned at the same 6px inset the container padding
// uses elsewhere, so it lines up with the box instead of hugging the edge.
const CHEVRON_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4 6l4 4 4-4' stroke='%23a1a1aa' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")"
const selectStyle = {
  backgroundImage: CHEVRON_SVG,
  backgroundPosition: 'right 6px center',
}

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
          style={selectStyle}
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
          style={selectStyle}
        >
          <option value="default">Default</option>
          <option value="roi">ROI</option>
          <option value="highlight">Highlight</option>
        </select>
      </label>
    </div>
  )
})
