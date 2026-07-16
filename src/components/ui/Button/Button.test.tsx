// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button/Button'

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Analyze</Button>)

    expect(screen.getByRole('button', { name: 'Analyze' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()

    render(<Button onClick={onClick}>Analyze</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn()

    render(
      <Button onClick={onClick} disabled>
        Analyze
      </Button>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies the secondary variant classes', () => {
    render(<Button variant="secondary">Cancel</Button>)

    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('border-border')
  })

  it('defaults to the primary variant', () => {
    render(<Button>Analyze</Button>)

    expect(screen.getByRole('button', { name: 'Analyze' }).className).toContain('bg-fg')
  })
})
