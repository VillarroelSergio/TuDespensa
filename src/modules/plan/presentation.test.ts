import { describe, expect, it } from 'vitest'

import {
  addWeeks,
  buildWeek,
  dayLabel,
  plannedCount,
  weekDates,
  weekRangeLabel,
  weekStart,
} from './presentation'
import type { PlannedMeal } from './types'

const meal = (overrides: Partial<PlannedMeal> = {}): PlannedMeal => ({
  mealDate: '2026-07-21',
  mealType: 'lunch',
  recipeId: 'recipe-1',
  title: 'Gazpacho andaluz',
  totalMinutes: 15,
  servings: 2,
  ...overrides,
})

describe('weekStart', () => {
  it('devuelve el lunes de la semana', () => {
    // 2026-07-20 es lunes; 2026-07-26, domingo de la misma semana.
    expect(weekStart('2026-07-20')).toBe('2026-07-20')
    expect(weekStart('2026-07-23')).toBe('2026-07-20')
    expect(weekStart('2026-07-26')).toBe('2026-07-20')
  })

  it('no se desplaza al cruzar de mes o de año', () => {
    expect(weekStart('2026-07-01')).toBe('2026-06-29')
    expect(weekStart('2027-01-01')).toBe('2026-12-28')
  })
})

describe('navegación entre semanas', () => {
  it('avanza y retrocede siete días', () => {
    expect(addWeeks('2026-07-20', 1)).toBe('2026-07-27')
    expect(addWeeks('2026-07-20', -1)).toBe('2026-07-13')
  })

  it('genera siete fechas consecutivas', () => {
    const dates = weekDates('2026-07-20')
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe('2026-07-20')
    expect(dates[6]).toBe('2026-07-26')
  })
})

describe('etiquetas', () => {
  it('nombra el día en español', () => {
    expect(dayLabel('2026-07-20')).toBe('lunes 20')
    expect(dayLabel('2026-07-26')).toBe('domingo 26')
  })

  it('resume el rango y repite el mes solo si cambia', () => {
    expect(weekRangeLabel('2026-07-20')).toBe('20 – 26 de julio')
    expect(weekRangeLabel('2026-06-29')).toBe('29 de junio – 5 de julio')
  })
})

describe('buildWeek', () => {
  it('siempre expone 7 días con dos huecos, ocupados o vacíos', () => {
    const days = buildWeek('2026-07-20', [meal()])
    expect(days).toHaveLength(7)
    expect(days.every((day) => day.slots.length === 2)).toBe(true)
    const tuesday = days[1]
    expect(tuesday.slots[0].meal?.title).toBe('Gazpacho andaluz')
    expect(tuesday.slots[1].meal).toBeNull()
  })

  it('ignora comidas fuera de la semana mostrada', () => {
    const days = buildWeek('2026-07-20', [meal({ mealDate: '2026-08-04' })])
    expect(plannedCount(days)).toBe(0)
  })

  it('cuenta las comidas planificadas sobre 14 huecos', () => {
    const days = buildWeek('2026-07-20', [
      meal(),
      meal({ mealType: 'dinner' }),
      meal({ mealDate: '2026-07-24' }),
    ])
    expect(plannedCount(days)).toBe(3)
  })
})
