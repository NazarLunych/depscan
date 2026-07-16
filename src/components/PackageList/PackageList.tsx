import { memo, useCallback, useEffect, useRef, useState } from 'react'

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
const FADE_SIZE_PX = 24
// A few px of slack for sub-pixel scroll positions near the ends, so the
// fade doesn't flicker on/off right at the boundary.
const EDGE_THRESHOLD_PX = 1

function buildMaskImage(canScrollUp: boolean, canScrollDown: boolean): string {
  const top = canScrollUp ? 'transparent' : 'black'
  const bottom = canScrollDown ? 'transparent' : 'black'

  return `linear-gradient(to bottom, ${top}, black ${FADE_SIZE_PX}px, black calc(100% - ${FADE_SIZE_PX}px), ${bottom})`
}

export const PackageList = memo(function PackageList({ order, packages }: PackageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
  })
  // Only fade an edge while there's actually more content to scroll to on
  // that side — otherwise the fade permanently hides the first/last card
  // even when the whole list already fits.
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = parentRef.current

    if (!el) {
      return
    }

    setCanScrollUp(el.scrollTop > EDGE_THRESHOLD_PX)
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_THRESHOLD_PX)
  }, [])

  // Re-check after the list's total height changes — filtering/sorting can
  // shrink the content below the container height without firing a scroll
  // event, which would otherwise leave a stale fade showing.
  const totalSize = virtualizer.getTotalSize()

  useEffect(() => {
    updateScrollState()
  }, [totalSize, updateScrollState])

  const maskImage = buildMaskImage(canScrollUp, canScrollDown)

  return (
    <div
      ref={parentRef}
      onScroll={updateScrollState}
      className="max-h-[70vh] overflow-auto"
      style={{
        // Fades whichever edge still has more content to scroll to, so
        // content doesn't just get clipped by a hard line, but a fully
        // visible list isn't permanently dimmed at either end.
        maskImage,
        WebkitMaskImage: maskImage,
      }}
    >
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
