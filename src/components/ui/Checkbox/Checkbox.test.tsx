// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox } from '@/components/ui/Checkbox/Checkbox'

describe('Checkbox', () => {
  it('renders the label', () => {
    render(<Checkbox checked={false} onChange={vi.fn()} label="Include devDependencies" />)

    expect(screen.getByText('Include devDependencies')).toBeInTheDocument()
  })

  it('reflects the checked prop', () => {
    render(<Checkbox checked label="Include devDependencies" onChange={vi.fn()} />)

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('calls onChange with the new value when clicked', () => {
    const onChange = vi.fn()

    render(<Checkbox checked={false} onChange={onChange} label="Include devDependencies" />)
    fireEvent.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('disables the input when disabled is set', () => {
    render(<Checkbox checked={false} onChange={vi.fn()} label="Include devDependencies" disabled />)

    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
