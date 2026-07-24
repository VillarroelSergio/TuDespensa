import { describe, expect, it } from 'vitest'

import { addFood, removeFood, reviewZone, stepForProgress } from './machine'

describe('onboarding machine', () => {
  it('deduplicates food case-insensitively', () => {
    expect(addFood(['Leche'], ' leche ')).toEqual({ foods: ['Leche'], duplicate: true })
  })

  it('removes an item and makes a reviewed zone in progress again', () => {
    expect(removeFood(['Leche'], 'Leche', 'reviewed_nonempty')).toEqual({
      foods: [], state: 'in_progress',
    })
  })

  it('only reviews a nonempty zone with food and allows an empty declaration', () => {
    expect(reviewZone(['Huevos'], false)).toBe('reviewed_nonempty')
    expect(reviewZone([], true)).toBe('reviewed_empty')
    expect(reviewZone([], false)).toBeNull()
  })

  it('restores the active server zone and sends review edits back to review', () => {
    expect(stepForProgress('fridge', 'inventory_in_progress', null)).toBe(2)
    expect(stepForProgress('pantry', 'awaiting_review', 'review')).toBe(4)
    expect(stepForProgress(null, 'awaiting_review', null)).toBe(5)
    expect(stepForProgress(null, 'completed', null)).toBe(6)
    expect(stepForProgress(null, 'inventory_in_progress', null)).toBe(5)
    expect(stepForProgress(null, 'household_draft', null)).toBe(1)
  })
})
