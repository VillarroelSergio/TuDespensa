import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./actions', () => ({
  assignMealAction: vi.fn(),
  moveMealAction: vi.fn(),
  removeMealAction: vi.fn(),
}))

import { WeekView } from './WeekView'

describe('WeekView', () => {
  it('agrupa los dos servicios de cada día en una fila de agenda', () => {
    const { container } = render(
      <WeekView
        startIso="2026-07-20"
        currentWeekIso="2026-07-20"
        meals={[
          {
            mealDate: '2026-07-20',
            mealType: 'lunch',
            recipeId: 'recipe-1',
            title: 'Lentejas de la mamá',
            totalMinutes: 45,
            servings: 2,
            cookedAt: null,
          },
        ]}
      />,
    )

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(7)
    expect(container.querySelectorAll('.plan-day__slots')).toHaveLength(7)
    expect(container.querySelectorAll('.plan-day__slots .plan-slot')).toHaveLength(
      14,
    )
    expect(
      screen.getByText((_, element) => element?.textContent === '1 de 14'),
    ).toBeInTheDocument()
    expect(screen.getByText('comidas planificadas')).toBeInTheDocument()
  })
})
