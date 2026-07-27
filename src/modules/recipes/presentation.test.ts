import { describe, expect, it } from 'vitest'

import { buildCatalogEntries } from '@/modules/plan/suggestions'

import {
  dishTypeLabel,
  filterRecipes,
  formatIngredient,
  ingredientAvailability,
  timeLabel,
} from './presentation'
import type { Recipe } from './types'

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'recipe-1',
  title: 'Tortilla de patatas',
  dishType: 'main',
  totalMinutes: 30,
  servings: 4,
  status: 'ready',
  isFavorite: false,
  categories: [],
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

  it('filters by favorite and by category', () => {
    const rows = [
      recipe({ id: 'a', title: 'Arroz', isFavorite: true, categories: ['Mediterranea'] }),
      recipe({ id: 'b', title: 'Bizcocho', isFavorite: false, categories: ['Postre'] }),
    ]
    expect(filterRecipes(rows, '', { favoritesOnly: true }).map((row) => row.id)).toEqual(['a'])
    expect(filterRecipes(rows, '', { category: 'Postre' }).map((row) => row.id)).toEqual(['b'])
  })

  it('ingredientAvailability empareja por catálogo cuando el texto no se parece', () => {
    const catalog = buildCatalogEntries([
      { canonicalName: 'Pan', terms: ['Pan'] },
    ])
    expect(
      ingredientAvailability(
        'pan del día anterior',
        [{ name: 'Pan', status: 'available' }],
        catalog,
      ),
    ).toBe('owned')
    expect(
      ingredientAvailability('pan del día anterior', [
        { name: 'Pan', status: 'out' },
      ]),
    ).toBe('missing')
  })

  it('formats ingredient amounts as canonical units', () => {
    expect(
      formatIngredient({ position: 0, name: 'Harina', quantity: 200, unitCode: 'g' }),
    ).toBe('0.2 uds. · Harina')
    expect(
      formatIngredient({ position: 1, name: 'Sal', quantity: null, unitCode: null }),
    ).toBe('Sal')
  })
})
