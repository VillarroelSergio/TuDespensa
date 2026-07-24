import { createBrowserClient } from '@supabase/ssr'

import type { Database } from '@/types/database'

import { getPublicSupabaseEnvironment } from './env'

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getPublicSupabaseEnvironment()

  return createBrowserClient<Database>(url, anonKey)
}
