export type PantryZone = 'fridge' | 'freezer' | 'pantry' | 'cleaning'

export type PantryTrackingMode = 'approximate' | 'units' | 'measure'
export type PantryApproximateState = 'plenty' | 'some' | 'low' | 'out'
export type PantryAttentionState = 'none' | 'low'
export type PantryUnitCode = 'unit' | 'g' | 'kg' | 'ml' | 'l'

export type PantryMutationInput = {
  itemId: string
  version: number
  trackingMode: PantryTrackingMode
  approximateState: PantryApproximateState | null
  quantity: number | string | null
  unitCode: PantryUnitCode | null
  key?: string
}

export interface PantryItem {
  id: string
  householdId: string
  locationId: string
  foodId: string
  presence: boolean
  quantity: number | null
  version: number
}
