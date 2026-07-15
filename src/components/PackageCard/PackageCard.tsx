import { memo } from 'react'

import type { PackageState } from '@/types'

import { getPackageCardStyle } from '@/components/PackageCard/highlightStyles'
import { PackageCardSkeleton } from '@/components/PackageCard/PackageCardSkeleton'

interface PackageCardProps {
  pkg: PackageState
}

export const PackageCard = memo(function PackageCard({ pkg }: PackageCardProps) {
  const style = getPackageCardStyle(pkg)

  return (
    <div className={`rounded-xl border bg-zinc-900 p-4 ${style.borderClass}`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium break-words text-zinc-100">{pkg.name}</span>
          <span className="ml-2 text-sm text-zinc-500">{pkg.currentVersion}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badgeClass}`}>
          {style.badgeLabel}
        </span>
      </div>

      {(pkg.status === 'pending' || pkg.status === 'analyzing') && <PackageCardSkeleton />}

      {pkg.status === 'error' && pkg.error && (
        <p className="mt-2 text-sm break-words text-red-400">{pkg.error}</p>
      )}

      {pkg.status === 'done' && pkg.analysis && (
        <div className="mt-3 space-y-2 text-sm text-zinc-400">
          <p className="break-words">
            <span className="text-zinc-500">Target:</span> {pkg.analysis.target_version} ·{' '}
            <span className="text-zinc-500">ROI:</span> {pkg.analysis.roi}
          </p>

          {pkg.analysis.breaking_changes.length > 0 && (
            <div>
              <p className="text-zinc-500">Breaking changes:</p>
              <ul className="list-inside list-disc">
                {pkg.analysis.breaking_changes.map((change) => (
                  <li key={change} className="break-words">
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pkg.analysis.migration_steps.length > 0 && (
            <div>
              <p className="text-zinc-500">Migration steps:</p>
              <ul className="list-inside list-disc">
                {pkg.analysis.migration_steps.map((step) => (
                  <li key={step} className="break-words">
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
