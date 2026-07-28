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
        meals={[]}
      />,
    )

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(7)
    expect(container.querySelectorAll('.plan-day__slots')).toHaveLength(7)
    expect(container.querySelectorAll('.plan-day__slots .plan-slot')).toHaveLength(
      14,
    )
  })
})
