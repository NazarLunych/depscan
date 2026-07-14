import type { PackageState } from '@/types'

interface HighlightStyle {
  borderClass: string
  badgeLabel: string
  badgeClass: string
}

const byHighlight: Record<'red' | 'yellow' | 'none', HighlightStyle> = {
  red: {
    borderClass: 'border-red-500/60',
    badgeLabel: 'Upgrade required',
    badgeClass: 'bg-red-500/10 text-red-400',
  },
  yellow: {
    borderClass: 'border-yellow-500/60',
    badgeLabel: 'Upgrade recommended',
    badgeClass: 'bg-yellow-500/10 text-yellow-400',
  },
  none: {
    borderClass: 'border-zinc-800',
    badgeLabel: 'Up to date',
    badgeClass: 'bg-zinc-800 text-zinc-400',
  },
}
const byStatus: Record<'pending' | 'analyzing' | 'error', HighlightStyle> = {
  pending: {
    borderClass: 'border-zinc-800',
    badgeLabel: 'Queued',
    badgeClass: 'bg-zinc-800 text-zinc-500',
  },
  analyzing: {
    borderClass: 'border-zinc-700',
    badgeLabel: 'Analyzing…',
    badgeClass: 'bg-zinc-800 text-zinc-300',
  },
  error: {
    borderClass: 'border-red-500/60',
    badgeLabel: 'Error',
    badgeClass: 'bg-red-500/10 text-red-400',
  },
}

export function getPackageCardStyle(pkg: PackageState): HighlightStyle {
  if (pkg.status === 'done' && pkg.analysis) {
    return byHighlight[pkg.analysis.highlight]
  }

  if (pkg.status === 'pending' || pkg.status === 'analyzing' || pkg.status === 'error') {
    return byStatus[pkg.status]
  }

  return byHighlight.none
}
