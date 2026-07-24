import type { SupabaseClient, Session } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

/**
 * Stores the session issued by the invitation's implicit magic link in the
 * cookie-backed browser client, so middleware and Server Actions share it.
 */
export async function persistInvitationSession(
  session: Session,
  client: SupabaseClient<Database>,
): Promise<void> {
  const { error } = await client.auth.setSession(session)
  if (error) throw error
}
