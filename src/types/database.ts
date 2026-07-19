export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type HouseholdOnboardingStatus = 'in_progress' | 'completed'
type HouseholdRole = 'owner' | 'member'
type HouseholdMemberStatus = 'active' | 'inactive'
type PantryZone = 'fridge' | 'freezer' | 'pantry'
type PantryMovementType = 'entry' | 'removal' | 'correction'
type OnboardingGlobalState =
  | 'household_draft'
  | 'inventory_in_progress'
  | 'awaiting_review'
  | 'confirming'
  | 'completed'
type OnboardingZoneState =
  'not_started' | 'in_progress' | 'reviewed_nonempty' | 'reviewed_empty'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string
          display_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          display_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          display_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      households: {
        Row: {
          id: string
          name: string
          onboarding_status: HouseholdOnboardingStatus
          baseline_confirmed_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          onboarding_status?: HouseholdOnboardingStatus
          baseline_confirmed_at?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          onboarding_status?: HouseholdOnboardingStatus
          baseline_confirmed_at?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_members: {
        Row: {
          household_id: string
          user_id: string
          role: HouseholdRole
          status: HouseholdMemberStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          household_id: string
          user_id: string
          role: HouseholdRole
          status?: HouseholdMemberStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          household_id?: string
          user_id?: string
          role?: HouseholdRole
          status?: HouseholdMemberStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_people: {
        Row: {
          id: string
          household_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      pantry_locations: {
        Row: {
          id: string
          household_id: string
          kind: PantryZone
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          kind: PantryZone
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          kind?: PantryZone
          created_at?: string
        }
        Relationships: []
      }
      household_foods: {
        Row: {
          id: string
          household_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      pantry_items: {
        Row: {
          id: string
          household_id: string
          location_id: string
          food_id: string
          tracking_mode: 'approximate'
          presence: boolean
          quantity: number | null
          version: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          location_id: string
          food_id: string
          tracking_mode?: 'approximate'
          presence?: boolean
          quantity?: number | null
          version?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          location_id?: string
          food_id?: string
          tracking_mode?: 'approximate'
          presence?: boolean
          quantity?: number | null
          version?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      pantry_movements: {
        Row: {
          id: string
          household_id: string
          item_id: string
          movement_type: PantryMovementType
          actor: string
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          item_id: string
          movement_type: PantryMovementType
          actor: string
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          item_id?: string
          movement_type?: PantryMovementType
          actor?: string
          created_at?: string
        }
        Relationships: []
      }
      onboarding_progress: {
        Row: {
          household_id: string
          global_state: OnboardingGlobalState
          active_zone: PantryZone | null
          return_target: 'review' | null
          updated_at: string
        }
        Insert: {
          household_id: string
          global_state?: OnboardingGlobalState
          active_zone?: PantryZone | null
          return_target?: 'review' | null
          updated_at?: string
        }
        Update: {
          household_id?: string
          global_state?: OnboardingGlobalState
          active_zone?: PantryZone | null
          return_target?: 'review' | null
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_zone_progress: {
        Row: {
          household_id: string
          zone: PantryZone
          state: OnboardingZoneState
          updated_at: string
        }
        Insert: {
          household_id: string
          zone: PantryZone
          state?: OnboardingZoneState
          updated_at?: string
        }
        Update: {
          household_id?: string
          zone?: PantryZone
          state?: OnboardingZoneState
          updated_at?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          household_id: string
          actor: string
          operation: string
          key: string
          request_hash: string
          result: Json
          created_at: string
        }
        Insert: {
          household_id: string
          actor: string
          operation: string
          key: string
          request_hash: string
          result?: Json
          created_at?: string
        }
        Update: {
          household_id?: string
          actor?: string
          operation?: string
          key?: string
          request_hash?: string
          result?: Json
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      create_household_with_onboarding: {
        Args: { name: string; people: Json; idempotency_key: string }
        Returns: Json
      }
      onboarding_add_pantry_item: {
        Args: { zone: PantryZone; food_name: string; idempotency_key: string }
        Returns: Json
      }
      onboarding_remove_pantry_item: {
        Args: { item_id: string; version: number }
        Returns: Json
      }
      onboarding_set_zone_state: {
        Args: { zone: PantryZone; state: OnboardingZoneState }
        Returns: Json
      }
      confirm_baseline: {
        Args: { idempotency_key: string }
        Returns: Json
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
