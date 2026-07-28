import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./actions', () => ({ assignMealAction: vi.fn() }))

import { ChooseRecipeView } from './ChooseRecipeView'

describe('ChooseRecipeView', () => {
  it('expone el número de resultados y una señal explícita para elegir', () => {
    render(
      <ChooseRecipeView
        mealDate="2026-07-20"
        mealType="lunch"
        query=""
        category=""
        suggestions={[]}
        recipes={[
          {
            id: 'recipe-1',
            householdId: 'household-1',
            title: 'Macarrones con verduras',
            dishType: null,
            totalMinutes: 25,
            servings: null,
            status: 'ready',
            isFavorite: false,
            categories: [],
          },
        ]}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('1 receta disponible')
    expect(
      screen.getByRole('button', { name: /Macarrones con verduras/ }),
    ).toHaveTextContent('Elegir →')
  })
})
