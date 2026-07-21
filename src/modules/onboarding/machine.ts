import type { OnboardingZoneState } from './types'
import type { OnboardingGlobalState } from './types'
import type { PantryZone } from '@/modules/pantry/types'

const canonical = (value: string) => value.trim().replace(/\s+/g, ' ')

export function addFood(foods: string[], food: string) {
  const value = canonical(food)
  const duplicate = foods.some((item) => item.localeCompare(value, 'es', { sensitivity: 'accent' }) === 0)
  return { foods: duplicate || !value ? foods : [...foods, value], duplicate }
}

export function removeFood(foods: string[], food: string, state: OnboardingZoneState) {
  const remaining = foods.filter((item) => item !== food)
  return { foods: remaining, state: remaining.length === 0 && state === 'reviewed_nonempty' ? 'in_progress' : state }
}

export function reviewZone(foods: string[], empty: boolean): OnboardingZoneState | null {
  if (foods.length > 0) return 'reviewed_nonempty'
  return empty ? 'reviewed_empty' : null
}

export function stepForProgress(
  activeZone: PantryZone | null,
  globalState: OnboardingGlobalState,
  returnTarget: 'review' | null,
): number {
  if (globalState === 'completed') return 6
  if (globalState === 'awaiting_review' && !returnTarget) return 5
  if (activeZone === 'fridge') return 2
  if (activeZone === 'freezer') return 3
  if (activeZone === 'pantry') return 4
  return globalState === 'household_draft' ? 1 : 5
}
