import { memo } from 'react'

import type { PackageState } from '@/types'

import { getPackageCardStyle } from '@/components/PackageCard/highlightStyles'
import { PackageCardSkeleton } from '@/components/PackageCard/PackageCardSkeleton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useRetryPackage } from '@/hooks/useRetryPackage'

interface PackageCardProps {
  pkg: PackageState
}

export const PackageCard = memo(function PackageCard({ pkg }: PackageCardProps) {
  const { retryPackage } = useRetryPackage()
  const style = getPackageCardStyle(pkg)

  return (
    <Card className={style.borderClass}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-fg font-medium break-words">{pkg.name}</span>
          <span className="text-muted ml-2 text-sm">{pkg.currentVersion}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badgeClass}`}>
          {style.badgeLabel}
        </span>
      </div>

      {(pkg.status === 'pending' || pkg.status === 'analyzing') && <PackageCardSkeleton />}

      {pkg.status === 'error' && pkg.error && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-sm break-words text-red-400">{pkg.error}</p>
          {/* An errored package never went through markDone, so currentVersion
              is still the original version range initPackages stored, not a
              resolved version — exactly what the retry endpoint needs. */}
          <Button
            variant="secondary"
            className="shrink-0 px-3 py-1.5"
            onClick={() => retryPackage(pkg.name, pkg.currentVersion)}
          >
            Retry
          </Button>
        </div>
      )}

      {pkg.status === 'done' && pkg.analysis && (
        <div className="text-muted mt-3 space-y-2 text-sm">
          <p className="break-words">
            <span className="text-muted">Target:</span> {pkg.analysis.target_version} ·{' '}
            <span className="text-muted">ROI:</span> {pkg.analysis.roi}
          </p>

          {pkg.analysis.breaking_changes.length > 0 && (
            <div>
              <p className="text-muted">Breaking changes:</p>
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
              <p className="text-muted">Migration steps:</p>
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
    </Card>
  )
})
