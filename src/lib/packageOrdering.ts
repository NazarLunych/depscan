import type { Highlight, PackageState, Roi } from '@/types'

export type HighlightFilter = Highlight | 'all'
export type SortMode = 'default' | 'roi' | 'highlight'

const highlightSeverity: Record<Highlight, number> = { red: 2, yellow: 1, none: 0 }
const roiSeverity: Record<Roi, number> = { high: 2, middle: 1, low: 0 }

function packageHighlight(pkg: PackageState): Highlight {
  return pkg.status === 'done' && pkg.analysis ? pkg.analysis.highlight : 'none'
}

function packageRoi(pkg: PackageState): Roi | null {
  return pkg.status === 'done' && pkg.analysis ? pkg.analysis.roi : null
}

export function filterOrder(
  order: string[],
  packages: Record<string, PackageState>,
  filter: HighlightFilter,
): string[] {
  if (filter === 'all') {
    return order
  }

  return order.filter((name) => {
    const pkg = packages[name]

    return pkg ? packageHighlight(pkg) === filter : false
  })
}

export function sortOrder(
  order: string[],
  packages: Record<string, PackageState>,
  sort: SortMode,
): string[] {
  if (sort === 'default') {
    return order
  }

  const withKeys = order.map((name) => {
    const pkg = packages[name]
    const roi = pkg ? packageRoi(pkg) : null
    const key =
      sort === 'roi'
        ? roi
          ? roiSeverity[roi]
          : -1
        : pkg
          ? highlightSeverity[packageHighlight(pkg)]
          : -1

    return { name, key }
  })

  // Array.prototype.sort has been stable per spec since ES2019, so entries
  // with equal severity keep their relative `order` position instead of
  // scrambling insertion order.
  return withKeys.sort((a, b) => b.key - a.key).map((entry) => entry.name)
}

export function deriveVisibleOrder(
  order: string[],
  packages: Record<string, PackageState>,
  filter: HighlightFilter,
  sort: SortMode,
): string[] {
  return sortOrder(filterOrder(order, packages, filter), packages, sort)
}

export function parseHighlightFilter(value: string | null): HighlightFilter {
  return value === 'red' || value === 'yellow' || value === 'none' ? value : 'all'
}

export function parseSortMode(value: string | null): SortMode {
  return value === 'roi' || value === 'highlight' ? value : 'default'
}
