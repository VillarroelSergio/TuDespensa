import { describe, expect, it } from 'vitest'

import { dishTypeLabel, filterRecipes, timeLabel } from './presentation'
import type { Recipe } from './types'

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'recipe-1',
  title: 'Tortilla de patatas',
  dishType: 'main',
  totalMinutes: 30,
  servings: 4,
  ...overrides,
})

describe('recipes presentation', () => {
  it('filters by title, sorted alphabetically', () => {
    const rows = filterRecipes(
      [
        recipe({ id: 'b', title: 'Gazpacho' }),
        recipe({ id: 'a', title: 'Ensalada' }),
        recipe({ id: 'c', title: 'Tortilla' }),
      ],
      'gazp',
    )

    expect(rows.map((row) => row.title)).toEqual(['Gazpacho'])
  })

  it('returns every recipe sorted when the term is empty', () => {
    const rows = filterRecipes(
      [recipe({ id: 'b', title: 'Sopa' }), recipe({ id: 'a', title: 'Arroz' })],
      '   ',
    )

    expect(rows.map((row) => row.title)).toEqual(['Arroz', 'Sopa'])
  })

  it('labels only the meaningful metadata', () => {
    expect(dishTypeLabel('dessert')).toBe('Postre')
    expect(dishTypeLabel(null)).toBe(null)
    expect(timeLabel(45)).toBe('45 min')
    expect(timeLabel(null)).toBe(null)
    expect(timeLabel(0)).toBe(null)
  })
})
