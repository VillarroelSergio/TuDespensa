import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PantryEntryForm } from './PantryEntryForm'

// Este proyecto no activa `globals: true` en vitest, así que el auto-cleanup
// de testing-library no se dispara solo entre tests del mismo fichero.
afterEach(cleanup)

describe('PantryEntryForm', () => {
  it('adds a product as present without asking for its current state', async () => {
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
        trackingMode: 'approximate',
        approximateState: 'some',
        quantity: null,
        unitCode: null,
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

  it('stores a countable product with its exact units', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<PantryEntryForm onClose={vi.fn()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Producto'), {
      target: { value: 'Tomates' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Unidades' }))
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
