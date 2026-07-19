export type HouseholdRole = 'owner' | 'member'
export type HouseholdOnboardingStatus = 'in_progress' | 'completed'

export interface HouseholdPerson {
  id: string
  name: string
}

export interface Household {
  id: string
  name: string
  onboardingStatus: HouseholdOnboardingStatus
  baselineConfirmedAt: string | null
}
