import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

describe('PantryWorkspace', () => {
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
})
