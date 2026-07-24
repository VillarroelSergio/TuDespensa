import 'server-only'

import { createClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

import { getServiceRoleEnvironment } from './env'

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = getServiceRoleEnvironment()

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}
