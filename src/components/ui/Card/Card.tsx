import { memo, type ReactNode } from 'react'

interface CardProps {
  className?: string
  children: ReactNode
}

export const Card = memo(function Card({ className = '', children }: CardProps) {
  return <div className={`bg-surface rounded-xl border p-4 ${className}`}>{children}</div>
})
