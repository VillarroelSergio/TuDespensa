'use server'

import { revalidatePath } from 'next/cache'
import { AppError } from '@/lib/errors/AppError'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseFoodName, parseHouseholdName, parseIdempotencyKey, parsePeople } from '@/lib/validation/onboarding'
import type { PantryZone } from '@/modules/pantry/types'
import type { OnboardingGlobalState, OnboardingZoneState } from './types'

export type OnboardingSnapshot = {
  household: { id: string; name: string; onboardingStatus: 'in_progress' | 'completed' } | null
  progress: { globalState: OnboardingGlobalState; activeZone: PantryZone | null; returnTarget: 'review' | null } | null
  zones: Record<PantryZone, OnboardingZoneState>
  items: Record<PantryZone, { name: string; itemId: string; version: number }[]>
}

function failure(error: { code?: string; message: string }): never {
  const code = error.code === '42501' ? 'FORBIDDEN' : error.code === '40001' ? 'CONFLICT' : error.code === '22023' || error.code === '23514' ? 'INVALID_INPUT' : 'UNEXPECTED'
  throw new AppError(code, error.message)
}
async function rpc<T>(name: string, args: Record<string, unknown>) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(name as never, args as never)
  if (error) failure(error)
  revalidatePath('/onboarding')
  return data as T
}
export async function createHousehold(input: { name: string; people: string[]; key?: string }) {
  return rpc('create_household_with_onboarding', { name: parseHouseholdName(input.name), people: parsePeople(input.people), idempotency_key: parseIdempotencyKey(input.key ?? createIdempotencyKey('create_household_with_onboarding')) })
}
export async function addPantryFood(zone: PantryZone, name: string, key?: string) { return rpc('onboarding_add_pantry_item', { zone, food_name: parseFoodName(name), idempotency_key: parseIdempotencyKey(key ?? createIdempotencyKey('onboarding_add_pantry_item')) }) }
export async function removePantryFood(itemId: string, version: number) { return rpc('onboarding_remove_pantry_item', { item_id: itemId, version }) }
export async function setZoneState(zone: PantryZone, state: OnboardingZoneState) { return rpc('onboarding_set_zone_state', { zone, state }) }
export async function confirmBaseline(key?: string) { return rpc('confirm_baseline', { idempotency_key: parseIdempotencyKey(key ?? createIdempotencyKey('confirm_baseline')) }) }

export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  const supabase = await createSupabaseServerClient()
  const empty: OnboardingSnapshot = { household: null, progress: null, zones: { fridge: 'not_started', freezer: 'not_started', pantry: 'not_started' }, items: { fridge: [], freezer: [], pantry: [] } }
  const { data: membership } = await supabase.from('household_members').select('household_id').eq('status', 'active').maybeSingle()
  if (!membership) return empty
  const householdId = membership.household_id
  const [{ data: household }, { data: progress }, { data: zoneRows }, { data: locations }, { data: pantryItems }] = await Promise.all([
    supabase.from('households').select('id,name,onboarding_status').eq('id', householdId).single(),
    supabase.from('onboarding_progress').select('global_state,active_zone,return_target').eq('household_id', householdId).maybeSingle(),
    supabase.from('onboarding_zone_progress').select('zone,state').eq('household_id', householdId),
    supabase.from('pantry_locations').select('id,kind').eq('household_id', householdId),
    supabase.from('pantry_items').select('id,location_id,food_id,version').eq('household_id', householdId).eq('presence', true),
  ])
  const foodIds = (pantryItems ?? []).map((item) => item.food_id)
  const { data: foods } = foodIds.length ? await supabase.from('household_foods').select('id,name').in('id', foodIds) : { data: [] as { id: string; name: string }[] }
  const locationsById = new Map((locations ?? []).map((location) => [location.id, location.kind]))
  const foodsById = new Map((foods ?? []).map((food) => [food.id, food.name]))
  for (const row of zoneRows ?? []) empty.zones[row.zone] = row.state
  for (const item of pantryItems ?? []) { const zone = locationsById.get(item.location_id); const name = foodsById.get(item.food_id); if (zone && name) empty.items[zone].push({ itemId: item.id, name, version: item.version }) }
  if (household) empty.household = { id: household.id, name: household.name, onboardingStatus: household.onboarding_status }
  if (progress) empty.progress = { globalState: progress.global_state, activeZone: progress.active_zone, returnTarget: progress.return_target }
  return empty
}

export async function setReturnTarget(target: 'review' | null) {
  const supabase = await createSupabaseServerClient()
  const { data: membership, error: membershipError } = await supabase.from('household_members').select('household_id').eq('status', 'active').single()
  if (membershipError) failure(membershipError)
  const { error } = await supabase.from('onboarding_progress').update({ return_target: target }).eq('household_id', membership.household_id)
  if (error) failure(error)
  revalidatePath('/onboarding')
}
