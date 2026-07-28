import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./actions', () => ({
  assignMealAction: vi.fn(),
  moveMealAction: vi.fn(),
  removeMealAction: vi.fn(),
}))

import { PlanSlotActions } from './PlanSlotActions'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
})

describe('PlanSlotActions', () => {
  it('abre las acciones en un diálogo con el contexto de la comida', () => {
    render(
      <PlanSlotActions
        meal={{
          mealDate: '2026-07-20',
          mealType: 'lunch',
          recipeId: 'recipe-1',
          title: 'Lentejas de la mamá',
          totalMinutes: 45,
          servings: 2,
          cookedAt: null,
        }}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Opciones de lunes, comida' }),
    )

    expect(screen.getByRole('dialog')).toHaveAttribute('open')
    expect(
      screen.getByRole('heading', { name: 'Lentejas de la mamá' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Cambiar receta' }),
    ).toBeInTheDocument()
  })
})
