// La entrevista guiada de alta solo cubre alimentos perecederos: no incluye
// la zona de limpieza que sí existe en PantryZone para el resto de la app.
export type OnboardingZone = 'fridge' | 'freezer' | 'pantry'

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
  activeZone: OnboardingZone | null
  returnTarget: 'review' | null
}
