import { memo } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

const variantClasses: Record<'primary' | 'secondary', string> = {
  primary: 'bg-zinc-100 text-zinc-950 disabled:opacity-40',
  secondary: 'border border-zinc-700 text-zinc-300 hover:bg-zinc-900',
}

export const Button = memo(function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
})
