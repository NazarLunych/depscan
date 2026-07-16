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
    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40">
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-zinc-700 bg-zinc-900 checked:border-zinc-100 checked:bg-zinc-100 disabled:cursor-not-allowed"
        />
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className="pointer-events-none absolute h-3 w-3 opacity-0 peer-checked:opacity-100"
        >
          <path
            d="M3 8l3.5 3.5L13 4.5"
            stroke="#09090b"
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
