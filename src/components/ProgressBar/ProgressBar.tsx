import { memo } from 'react'

interface ProgressBarProps {
  done: number
  failed: number
  total: number
}

export const ProgressBar = memo(function ProgressBar({ done, failed, total }: ProgressBarProps) {
  const settled = done + failed
  const percent = total === 0 ? 0 : Math.round((settled / total) * 100)

  return (
    <div className="w-full max-w-2xl">
      <div className="text-muted mb-1 flex justify-between text-sm">
        <span>
          {settled} / {total}
        </span>
        <span>{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={settled}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuetext={`${settled} of ${total} packages analyzed${failed > 0 ? `, ${failed} failed` : ''}`}
        className="bg-surface h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-fg h-full rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
})
