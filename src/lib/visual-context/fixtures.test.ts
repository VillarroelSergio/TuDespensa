import { describe, expect, it } from 'vitest'

import {
  getVisualFixtureScenario,
  getVisualFixtureCookPreview,
  getVisualFixtureWeekMeals,
  visualFixture,
} from './fixtures'

describe('visual-context fixtures', () => {
  it('only exposes visual scenarios in development', () => {
    expect(getVisualFixtureScenario('empty', 'development')).toBe('empty')
    expect(getVisualFixtureScenario('everyday', 'development')).toBe('everyday')
    expect(getVisualFixtureScenario('empty', 'production')).toBeNull()
    expect(getVisualFixtureScenario('everyday', 'production')).toBeNull()
    expect(getVisualFixtureScenario('unknown', 'development')).toBeNull()
  })

  it('provides populated, deterministic data for every core destination', () => {
    expect(visualFixture.pantry.length).toBeGreaterThan(0)
    expect(visualFixture.recipes.length).toBeGreaterThan(0)
    expect(visualFixture.shopping.length).toBeGreaterThan(0)
    expect(visualFixture.checkout.length).toBeGreaterThan(0)
    expect(visualFixture.suggestions).toHaveLength(3)
  })

  it('builds a populated week from the requested Monday', () => {
    const meals = getVisualFixtureWeekMeals('2026-07-20')

    expect(meals).toHaveLength(7)
    expect(meals.some((meal) => meal.cookedAt !== null)).toBe(true)
    expect(meals.map((meal) => meal.mealDate)).toContain('2026-07-26')
  })

  it('builds an empty week for the neutral visual state', () => {
    expect(getVisualFixtureWeekMeals('2026-07-20', 'empty')).toEqual([])
  })

  it('provides a local Cook preview and keeps the empty state neutral', () => {
    const preview = getVisualFixtureCookPreview(
      '2026-07-20',
      'lunch',
      'everyday',
    )

    expect(preview?.title).toBe('Ensalada templada de garbanzos')
    expect(preview?.lines).toHaveLength(3)
    expect(
      getVisualFixtureCookPreview('2026-07-20', 'lunch', 'empty'),
    ).toBeNull()
  })
})
