import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PantryList } from './PantryList'

afterEach(cleanup)

describe('PantryList', () => {
  it('renders urgent food before the regular inventory and supports search', () => {
    render(
      <PantryList
        initialItems={[
          {
            id: 'pasta',
            foodId: 'f-pasta',
            name: 'Macarrones',
            version: 1,
            trackingMode: 'measure',
            approximateState: null,
            attentionState: 'none',
            quantity: 500,
            unitCode: 'g',
          },
          {
            id: 'milk',
            foodId: 'f-milk',
            name: 'Leche',
            version: 2,
            trackingMode: 'units',
            approximateState: null,
            attentionState: 'none',
            quantity: 0,
            unitCode: 'unit',
          },
        ]}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Despensa' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Terminados')).toBeInTheDocument()
    expect(screen.getByText('Leche')).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: 'Buscar en despensa' }),
    ).toBeInTheDocument()
  })

  it('only offers the finished action from the inventory row', () => {
    const onSetPresence = vi.fn()
    render(
      <PantryList
        initialItems={[
          {
            id: 'yogurt',
            foodId: 'f-yogurt',
            name: 'Yogures',
            version: 3,
            trackingMode: 'units',
            approximateState: null,
            attentionState: 'none',
            quantity: 4,
            unitCode: 'unit',
          },
        ]}
        onSetPresence={onSetPresence}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Marcar Yogures como terminado' }),
    )
    expect(onSetPresence).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'yogurt', version: 3 }),
      'out',
    )
    expect(screen.queryByLabelText('Ajustar Yogures')).not.toBeInTheDocument()
  })
})
