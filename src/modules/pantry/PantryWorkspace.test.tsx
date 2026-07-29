import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({
      on() {
        return this
      },
      subscribe: () => {},
    }),
    removeChannel: vi.fn(),
  }),
}))
vi.mock('./actions', () => ({
  adjustPantryItem: vi.fn(),
  clearPantryAttention: vi.fn(),
  correctPantryItem: vi
    .fn()
    .mockResolvedValue({ item_id: 'tomatoes', version: 2, presence: false }),
  deletePantryItem: vi.fn(),
  markPantryLow: vi.fn(),
  recordPantryEntry: vi.fn(),
}))
vi.mock('@/modules/shopping/actions', () => ({
  addShoppingItem: vi.fn().mockResolvedValue({ item_id: 's1', version: 1 }),
}))

import { PantryWorkspace } from './PantryWorkspace'
import { correctPantryItem } from './actions'

describe('PantryWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dismisses the finished-item toast after adding it to the shopping list', async () => {
    render(
      <PantryWorkspace
        initialItems={[
          {
            id: 'tomatoes',
            foodId: 'f-tomatoes',
            name: 'Tomates',
            version: 1,
            trackingMode: 'approximate',
            approximateState: 'some',
            attentionState: 'none',
            quantity: null,
            unitCode: null,
          },
        ]}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Marcar Tomates como terminado' }),
    )
    await screen.findByText('Añadir a compra')

    fireEvent.click(screen.getByRole('button', { name: 'Añadir a compra' }))

    await waitFor(() =>
      expect(screen.queryByText('Añadir a compra')).not.toBeInTheDocument(),
    )
  })

  it('sends only one mutation when the finished control is clicked twice quickly', async () => {
    render(
      <PantryWorkspace
        initialItems={[
          {
            id: 'tomatoes',
            foodId: 'f-tomatoes',
            name: 'Tomates',
            version: 1,
            trackingMode: 'approximate',
            approximateState: 'some',
            attentionState: 'none',
            quantity: null,
            unitCode: null,
          },
        ]}
      />,
    )

    const button = screen.getByRole('button', {
      name: 'Marcar Tomates como terminado',
    })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(correctPantryItem).toHaveBeenCalledTimes(1))
  })
})
