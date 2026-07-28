import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PantryEntryForm } from './PantryEntryForm'

afterEach(cleanup)

describe('PantryEntryForm', () => {
  it('adds a product as units by default', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<PantryEntryForm onClose={vi.fn()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Producto'), {
      target: { value: 'Yogures' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a despensa' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        foodName: 'Yogures',
        zone: 'pantry',
        trackingMode: 'units',
        approximateState: null,
        quantity: 1,
        unitCode: 'unit',
      }),
    )
  })

  it('lets you pick a different zone before saving', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<PantryEntryForm onClose={vi.fn()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Producto'), {
      target: { value: 'Lejía' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Limpieza' }))
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a despensa' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ foodName: 'Lejía', zone: 'cleaning' }),
    )
  })

  it('stores the entered unit count', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<PantryEntryForm onClose={vi.fn()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Producto'), {
      target: { value: 'Tomates' },
    })
    fireEvent.change(screen.getByLabelText('Cantidad'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a despensa' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        foodName: 'Tomates',
        trackingMode: 'units',
        approximateState: null,
        quantity: 10,
        unitCode: 'unit',
      }),
    )
  })
})
