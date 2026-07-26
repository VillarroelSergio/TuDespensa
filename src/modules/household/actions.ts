'use server'

import { revalidatePath } from 'next/cache'

import { AppError } from '@/lib/errors/AppError'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  generateInvitationCode,
  hashInvitationCode,
} from '@/modules/auth/invitation-code'

export type HouseholdManagement = {
  isOwner: boolean
  householdName: string
  activeMemberCount: number
  activeMembers: {
    id: string
    label: string
    role: 'owner' | 'member'
  }[]
  pendingInvitations: { id: string; expiresAt: string }[]
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

// Genera (o renueva) el código de invitación del hogar. El código en claro
// EXISTE SOLO AQUÍ, en el valor de retorno: se muestra una vez a la
// propietaria y nunca se guarda ni se registra en ningún sitio. Solo su hash
// llega a la base de datos. Usa el cliente de sesión, no el admin: la RPC ya
// exige que quien llama sea la propietaria, así que RLS y los permisos por
// columna siguen siendo la defensa real.
export async function createInvitationCode(): Promise<{
  code: string
  expiresAt: string
}> {
  const supabase = await createSupabaseServerClient()
  const code = generateInvitationCode()
  const codeHash = hashInvitationCode(code)
  // generateInvitationCode() siempre produce un código con forma válida, así
  // que esto nunca debería ser null; es una defensa en profundidad, no una
  // rama alcanzable en la práctica.
  if (codeHash === null) {
    throw new AppError('UNEXPECTED', 'Invitation code generation failed')
  }
  const { data, error } = await supabase.rpc('create_household_invitation', {
    code_hash: codeHash,
  })
  if (error) failure(error)
  const result = data as { invitation_id: string; expires_at: string }
  revalidatePath('/hogar')
  return { code, expiresAt: result.expires_at }
}

// Canjea un código de invitación para la sesión ya autenticada que llama
// (una cuenta que ya existe pero todavía no es miembro de ningún hogar). Si
// el código no tiene forma válida ni se llega a consultar la base de datos.
export async function redeemInvitationCode(
  code: string,
): Promise<{ ok: boolean }> {
  const codeHash = hashInvitationCode(code)
  if (codeHash === null) return { ok: false }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('redeem_invitation', {
    code_hash: codeHash,
  })
  if (error) return { ok: false }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('revoke_household_invitation', {
    invitation_id: invitationId,
  })
  if (error) failure(error)
  revalidatePath('/hogar')
}

export async function resetPilotHousehold(confirmation: string): Promise<void> {
  if (confirmation !== 'BORRAR') {
    throw new AppError('INVALID_INPUT', 'Confirmation is required')
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new AppError('FORBIDDEN', 'Authentication is required')

  const { data, error } = await supabase.rpc('reset_pilot_household', {
    confirmation,
  })
  if (error) failure(error)

  const memberIds = data ?? []
  const admin = createSupabaseAdminClient()
  for (const memberId of memberIds) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(memberId)
    if (deleteError) failure(deleteError)
  }
}

export async function getHouseholdManagement(): Promise<HouseholdManagement | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: household }, { data: members }, { data: invitations }] =
    await Promise.all([
      supabase.from('households').select('name').maybeSingle(),
      supabase
        .from('household_members')
        .select('user_id,role')
        .eq('status', 'active'),
      // email, invited_by y code_hash ya no son legibles por `authenticated`
      // (permisos por columna, ver migración 20260726150000): pedirlos
      // rompería esta consulta. Ninguno de los dos hace falta para mostrar la
      // gestión del hogar.
      supabase
        .from('household_invitations')
        .select('id,status,expires_at')
        .eq('status', 'pending'),
    ])

  if (!household) return null
  const isOwner =
    (members ?? []).find((member) => member.user_id === user.id)?.role ===
    'owner'
  // Ya no hay correo disponible para identificar a la otra persona, y
  // tampoco es un dato que necesitemos mostrar: basta con distinguir "Tú" del
  // resto.
  const activeMembers = (members ?? []).map((member) => ({
    id: member.user_id,
    label: member.user_id === user.id ? 'Tú' : 'Integrante del hogar',
    role: member.role,
  }))

  return {
    isOwner,
    householdName: household.name,
    activeMemberCount: activeMembers.length,
    activeMembers,
    pendingInvitations: (invitations ?? []).map((invitation) => ({
      id: invitation.id,
      expiresAt: invitation.expires_at,
    })),
  }
}
