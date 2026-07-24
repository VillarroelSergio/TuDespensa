import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from '@/types/database'

import { getPublicSupabaseEnvironment } from './env'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = getPublicSupabaseEnvironment()

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot write cookies. A later proxy will own refresh writes.
        }
      },
    },
  })
}
