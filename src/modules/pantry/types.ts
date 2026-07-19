export type PantryZone = 'fridge' | 'freezer' | 'pantry'

export interface PantryItem {
  id: string
  householdId: string
  locationId: string
  foodId: string
  presence: boolean
  quantity: number | null
  version: number
}
