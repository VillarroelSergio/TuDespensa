import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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
})
