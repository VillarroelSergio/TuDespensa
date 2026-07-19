import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PrimaryButton } from './PrimaryButton'

describe('PrimaryButton', () => {
  afterEach(cleanup)
  it('explains unavailable actions without removing keyboard focus', () => {
    render(<PrimaryButton disabledReason="Añade un alimento">Continuar</PrimaryButton>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button')).not.toBeDisabled()
    expect(screen.getByText('Añade un alimento')).toBeInTheDocument()
  })

  it('runs an enabled action', () => {
    const onClick = vi.fn()
    render(<PrimaryButton onClick={onClick}>Continuar</PrimaryButton>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
