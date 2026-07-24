'use server'

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { AppError } from '@/lib/errors/AppError'
import { getPublicSupabaseEnvironment } from '@/lib/supabase/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

export type PendingInvitation = {
  invitationId: string
  householdId: string
  householdName: string
  invitedByName: string
}

export type HouseholdManagement = {
  isOwner: boolean
  householdName: string
  activeMemberCount: number
  activeMembers: {
    id: string
    label: string
    role: 'owner' | 'member'
  }[]
  pendingInvitations: { id: string; email: string }[]
}

function failure(error: { code?: string; message: string }): never {
  const code =
    error.code === '42501'
      ? 'FORBIDDEN'
      : error.code === '40001'
        ? 'CONFLICT'
        : error.code === '23505'
          ? 'CONFLICT'
          : error.code === '22023' || error.code === '23514'
            ? 'INVALID_INPUT'
            : 'UNEXPECTED'
  throw new AppError(code, error.message)
}

// Reenvía el acceso reutilizando el enlace mágico del login: crea la cuenta si
// no existe y envía el correo. Como esta solicitud nace en el servidor, el
// navegador invitado no tiene el verificador de PKCE: se usa un callback propio
// con flujo implícito que transfiere la sesión a las cookies SSR. No toca la
// sesión del propietario (cliente anónimo sin persistencia).
async function sendAccessEmail(email: string): Promise<boolean> {
  const headerList = await headers()
  const host = headerList.get('host')
  const proto = headerList.get('x-forwarded-proto') ?? 'https'
  const { url, anonKey } = getPublicSupabaseEnvironment()
  const anon = createClient<Database>(url, anonKey, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  const { error } = await anon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: host
        ? `${proto}://${host}/auth/invitation-callback`
        : undefined,
    },
  })
  return !error
}

export async function inviteMember(
  email: string,
): Promise<{ email: string; householdName: string; emailSent: boolean }> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('invite_household_member', {
    target_email: email,
  })
  if (error) failure(error)
  const result = data as { email: string; household_name: string }
  const emailSent = await sendAccessEmail(result.email)
  revalidatePath('/hogar')
  return {
    email: result.email,
    householdName: result.household_name,
    emailSent,
  }
}

export async function resendInvitation(email: string): Promise<boolean> {
  return sendAccessEmail(email.toLowerCase().trim())
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('revoke_household_invitation', {
    invitation_id: invitationId,
  })
  if (error) failure(error)
  revalidatePath('/hogar')
}

export async function acceptInvitation(
  invitationId: string,
): Promise<{ householdId: string }> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('accept_household_invitation', {
    invitation_id: invitationId,
  })
  if (error) failure(error)
  const result = data as { household_id: string }
  revalidatePath('/', 'layout')
  return { householdId: result.household_id }
}

export async function getMyPendingInvitation(): Promise<PendingInvitation | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_my_pending_invitation')
  if (error || !data) return null
  const row = data as {
    invitation_id: string
    household_id: string
    household_name: string
    invited_by_name: string
  }
  return {
    invitationId: row.invitation_id,
    householdId: row.household_id,
    householdName: row.household_name,
    invitedByName: row.invited_by_name,
  }
}

export async function getHouseholdManagement(): Promise<HouseholdManagement | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [
    { data: household },
    { data: members },
    { data: invitations },
  ] = await Promise.all([
    supabase.from('households').select('name').maybeSingle(),
    supabase
      .from('household_members')
      .select('user_id,role')
      .eq('status', 'active'),
    supabase
      .from('household_invitations')
      .select('id,email,status,accepted_by')
      .in('status', ['pending', 'accepted']),
  ])

  if (!household) return null
  const isOwner =
    (members ?? []).find((member) => member.user_id === user.id)?.role ===
    'owner'
  const acceptedEmailByUserId = new Map(
    (invitations ?? [])
      .filter(
        (invitation) =>
          invitation.status === 'accepted' && invitation.accepted_by,
      )
      .map((invitation) => [invitation.accepted_by!, invitation.email]),
  )
  const activeMembers = (members ?? []).map((member) => ({
    id: member.user_id,
    label:
      member.user_id === user.id
        ? 'Tú'
        : (acceptedEmailByUserId.get(member.user_id) ?? 'Integrante del hogar'),
    role: member.role,
  }))

  return {
    isOwner,
    householdName: household.name,
    activeMemberCount: activeMembers.length,
    activeMembers,
    pendingInvitations: (invitations ?? [])
      .filter((invitation) => invitation.status === 'pending')
      .map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
      })),
  }
}
