'use server'

import { revalidatePath } from 'next/cache'

import { AppError } from '@/lib/errors/AppError'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseIdempotencyKey } from '@/lib/validation/onboarding'
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
    isSelf: boolean
  }[]
  pendingInvitations: { id: string; expiresAt: string }[]
  needsNameClaim: boolean
  unclaimedPeople: { id: string; name: string }[]
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

  const [{ data: household }, { data: members }, { data: invitations }, { data: people }] =
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
      // RLS ya limita esto al hogar activo de quien llama.
      supabase.from('household_people').select('id,name,linked_user_id'),
    ])

  if (!household) return null
  const isOwner =
    (members ?? []).find((member) => member.user_id === user.id)?.role ===
    'owner'
  const nameByUserId = new Map(
    (people ?? [])
      .filter((person) => person.linked_user_id !== null)
      .map((person) => [person.linked_user_id as string, person.name]),
  )
  const activeMembers = (members ?? []).map((member) => {
    const isSelf = member.user_id === user.id
    return {
      id: member.user_id,
      label:
        nameByUserId.get(member.user_id) ??
        (isSelf ? 'Tú' : 'Integrante del hogar'),
      role: member.role,
      isSelf,
    }
  })
  const unclaimedPeople = (people ?? [])
    .filter((person) => person.linked_user_id === null)
    .map((person) => ({ id: person.id, name: person.name }))

  return {
    isOwner,
    householdName: household.name,
    activeMemberCount: activeMembers.length,
    activeMembers,
    pendingInvitations: (invitations ?? []).map((invitation) => ({
      id: invitation.id,
      expiresAt: invitation.expires_at,
    })),
    needsNameClaim: !nameByUserId.has(user.id),
    unclaimedPeople,
  }
}

// La cuenta indica cuál de los nombres dados de alta en el onboarding es
// ella, o escribe el suyo si no está en la lista. Así "Mi hogar" puede
// mostrar el nombre real de cada cuenta.
export async function claimHouseholdPerson(
  input: { personId: string } | { name: string },
  key?: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('claim_household_person', {
    person_id: 'personId' in input ? input.personId : null,
    person_name: 'name' in input ? input.name : null,
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('claim_household_person'),
    ),
  })
  if (error) failure(error)
  revalidatePath('/hogar')
}
