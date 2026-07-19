import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PantryList } from './PantryList'

describe('PantryList', () => {
  it('renders urgent food before the regular inventory and supports search', () => {
    render(
      <PantryList
        initialItems={[
          { id: 'pasta', foodId: 'f-pasta', name: 'Macarrones', version: 1, trackingMode: 'measure', approximateState: null, quantity: 500, unitCode: 'g' },
          { id: 'milk', foodId: 'f-milk', name: 'Leche', version: 2, trackingMode: 'units', approximateState: null, quantity: 0, unitCode: 'unit' },
        ]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Despensa' })).toBeInTheDocument()
    expect(screen.getByText('Requieren atención')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Leche/ })[0]).toHaveTextContent('Se terminó')
    expect(screen.getByRole('searchbox', { name: 'Buscar en despensa' })).toBeInTheDocument()
  })

  it('offers a one-step action to mark an available item as low', () => {
    const onMarkLow = vi.fn()
    render(
      <PantryList
        initialItems={[
          { id: 'yogurt', foodId: 'f-yogurt', name: 'Yogures', version: 3, trackingMode: 'units', approximateState: null, quantity: 4, unitCode: 'unit' },
        ]}
        onMarkLow={onMarkLow}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Marcar Yogures como queda poco' }))
    expect(onMarkLow).toHaveBeenCalledWith(expect.objectContaining({ id: 'yogurt', version: 3 }))
  })
})
