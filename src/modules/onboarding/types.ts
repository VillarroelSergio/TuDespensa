import type { PantryZone } from '@/modules/pantry/types'

export type OnboardingGlobalState =
  | 'household_draft'
  | 'inventory_in_progress'
  | 'awaiting_review'
  | 'confirming'
  | 'completed'

export type OnboardingZoneState =
  'not_started' | 'in_progress' | 'reviewed_nonempty' | 'reviewed_empty'

export interface OnboardingProgress {
  householdId: string
  globalState: OnboardingGlobalState
  activeZone: PantryZone | null
  returnTarget: 'review' | null
}
