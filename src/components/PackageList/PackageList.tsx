import { memo, useRef } from 'react'

import type { PackageState } from '@/types'
import { useVirtualizer } from '@tanstack/react-virtual'

import { PackageCard } from '@/components/PackageCard'

interface PackageListProps {
  order: string[]
  packages: Record<string, PackageState>
}

// Rows vary a lot in height (skeleton vs. done-with-N-breaking-changes vs.
// error), so this is only a starting estimate — measureElement below corrects
// each row's real height after it mounts.
const ESTIMATED_ROW_HEIGHT = 96

export const PackageList = memo(function PackageList({ order, packages }: PackageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
  })

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const name = order[virtualRow.index]
          const pkg = name ? packages[name] : undefined

          if (!pkg) {
            return null
          }

          return (
            <div
              key={name}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="pb-3"
            >
              <PackageCard pkg={pkg} />
            </div>
          )
        })}
      </div>
    </div>
  )
})
