import { memo } from 'react'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}

export const Checkbox = memo(function Checkbox({
  checked,
  onChange,
  disabled = false,
  label,
}: CheckboxProps) {
  return (
    <label className="text-muted flex cursor-pointer items-center gap-2 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40">
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="peer border-border bg-surface checked:border-fg checked:bg-fg h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border disabled:cursor-not-allowed"
        />
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className="text-bg pointer-events-none absolute h-3 w-3 opacity-0 peer-checked:opacity-100"
        >
          <path
            d="M3 8l3.5 3.5L13 4.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>{' '}
      {label}
    </label>
  )
})
