import { memo } from 'react'

export const PackageCardSkeleton = memo(function PackageCardSkeleton() {
  return (
    <div className="mt-3 space-y-2" data-testid="package-card-skeleton">
      <div className="bg-border h-3 w-2/3 animate-pulse rounded" />
      <div className="bg-border h-3 w-1/2 animate-pulse rounded" />
      <div className="bg-border h-3 w-5/6 animate-pulse rounded" />
    </div>
  )
})
