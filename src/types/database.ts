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
type PantryMovementType =
  'entry' | 'removal' | 'correction' | 'consumption' | 'adjustment'
type PantryTrackingMode = 'approximate' | 'units' | 'measure'
type PantryApproximateState = 'plenty' | 'some' | 'low' | 'out'
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
          catalog_food_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          catalog_food_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          catalog_food_id?: string | null
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
          tracking_mode: PantryTrackingMode
          presence: boolean
          quantity: number | null
          approximate_state: PantryApproximateState
          attention_state: 'none' | 'low'
          unit_code: 'unit' | 'g' | 'kg' | 'ml' | 'l' | null
          entered_at: string
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
          tracking_mode?: PantryTrackingMode
          presence?: boolean
          quantity?: number | null
          approximate_state?: PantryApproximateState
          attention_state?: 'none' | 'low'
          unit_code?: 'unit' | 'g' | 'kg' | 'ml' | 'l' | null
          entered_at?: string
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
          tracking_mode?: PantryTrackingMode
          presence?: boolean
          quantity?: number | null
          approximate_state?: PantryApproximateState
          attention_state?: 'none' | 'low'
          unit_code?: 'unit' | 'g' | 'kg' | 'ml' | 'l' | null
          entered_at?: string
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
          quantity_delta: number | null
          item_snapshot: Json
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          item_id: string
          movement_type: PantryMovementType
          actor: string
          quantity_delta?: number | null
          item_snapshot?: Json
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          item_id?: string
          movement_type?: PantryMovementType
          actor?: string
          quantity_delta?: number | null
          item_snapshot?: Json
          created_at?: string
        }
        Relationships: []
      }
      catalog_foods: {
        Row: {
          id: string
          canonical_name: string
          category: string
          consume_soon_after: string | null
          created_at: string
        }
        Insert: {
          id?: string
          canonical_name: string
          category?: string
          consume_soon_after?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          canonical_name?: string
          category?: string
          consume_soon_after?: string | null
          created_at?: string
        }
        Relationships: []
      }
      food_aliases: {
        Row: {
          id: string
          catalog_food_id: string
          alias: string
          created_at: string
        }
        Insert: {
          id?: string
          catalog_food_id: string
          alias: string
          created_at?: string
        }
        Update: {
          id?: string
          catalog_food_id?: string
          alias?: string
          created_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          code: 'unit' | 'g' | 'kg' | 'ml' | 'l'
          family: 'units' | 'mass' | 'volume'
          label: string
        }
        Insert: {
          code: 'unit' | 'g' | 'kg' | 'ml' | 'l'
          family: 'units' | 'mass' | 'volume'
          label: string
        }
        Update: {
          code?: 'unit' | 'g' | 'kg' | 'ml' | 'l'
          family?: 'units' | 'mass' | 'volume'
          label?: string
        }
        Relationships: []
      }
      household_food_aliases: {
        Row: {
          id: string
          household_id: string
          food_id: string
          alias: string
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          food_id: string
          alias: string
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          food_id?: string
          alias?: string
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
    Views: {
      pantry_consume_soon: {
        Row: {
          pantry_item_id: string
          household_id: string
          food_id: string
          entered_at: string
          household_food_name: string
          category: string | null
          consume_soon: boolean
        }
        Relationships: []
      }
    }
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
      pantry_record_entry: {
        Args: {
          zone: PantryZone
          food_name: string
          tracking_mode: PantryTrackingMode
          approximate_state: PantryApproximateState | null
          quantity: number | null
          unit_code: string | null
          idempotency_key: string
        }
        Returns: Json
      }
      pantry_correct_item: {
        Args: {
          item_id: string
          version: number
          tracking_mode: PantryTrackingMode
          approximate_state: PantryApproximateState | null
          quantity: number | null
          unit_code: string | null
          idempotency_key: string
        }
        Returns: Json
      }
      pantry_adjust_item: {
        Args: {
          item_id: string
          version: number
          tracking_mode: PantryTrackingMode
          approximate_state: PantryApproximateState | null
          quantity: number | null
          unit_code: string | null
          idempotency_key: string
        }
        Returns: Json
      }
      pantry_consume_item: {
        Args: {
          item_id: string
          version: number
          tracking_mode: PantryTrackingMode
          approximate_state: PantryApproximateState | null
          quantity: number | null
          unit_code: string | null
          idempotency_key: string
        }
        Returns: Json
      }
      pantry_mark_low: {
        Args: { item_id: string; version: number; idempotency_key: string }
        Returns: Json
      }
      pantry_mark_out: {
        Args: { item_id: string; version: number; idempotency_key: string }
        Returns: Json
      }
      pantry_set_attention: {
        Args: { item_id: string; version: number; attention_state: 'none' | 'low'; idempotency_key: string }
        Returns: Json
      }
      pantry_rename_household_food: {
        Args: { food_id: string; name: string; idempotency_key: string }
        Returns: Json
      }
      pantry_add_household_food_alias: {
        Args: { food_id: string; alias: string; idempotency_key: string }
        Returns: Json
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
