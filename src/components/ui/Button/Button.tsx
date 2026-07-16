import { memo } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

const variantClasses: Record<'primary' | 'secondary', string> = {
  primary: 'bg-fg text-bg disabled:opacity-40',
  secondary: 'border border-border text-muted hover:bg-surface',
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
