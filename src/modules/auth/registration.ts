'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

import { hashInvitationCode } from './invitation-code'

export type RegistrationResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'code_required'
        | 'code_invalid'
        | 'email_taken'
        | 'invalid_input'
        | 'unexpected'
    }

function isValidEmail(email: string): boolean {
  const at = email.indexOf('@')
  if (at <= 0) return false
  const domain = email.slice(at + 1)
  return domain.includes('.') && domain.length > 2
}

export async function registerAccount(input: {
  email: string
  password: string
  code?: string
}): Promise<RegistrationResult> {
  if (!isValidEmail(input.email) || input.password.length < 8) {
    return { ok: false, reason: 'invalid_input' }
  }

  const admin = createSupabaseAdminClient()

  // ¿Existe ya el hogar? No se puede consultar `households` directamente: sus
  // permisos de tabla están revocados incluso para `service_role`, así que la
  // consulta directa siempre devolvía "permission denied" y, al ignorarse ese
  // error, el registro quedaba abierto sin código. Se pregunta por RPC y se
  // FALLA CERRADO: si no podemos saberlo, no se crea ninguna cuenta.
  const { data: householdExists, error: householdCheckError } = await admin.rpc(
    'pilot_household_exists',
  )
  if (householdCheckError) {
    return { ok: false, reason: 'unexpected' }
  }

  let codeHash: string | null = null
  if (householdExists) {
    // Ya hay un hogar: el piloto es de máximo dos cuentas, así que la
    // segunda cuenta solo puede crearse canjeando el código de invitación.
    if (!input.code) {
      return { ok: false, reason: 'code_required' }
    }
    codeHash = hashInvitationCode(input.code)
    if (codeHash === null) {
      return { ok: false, reason: 'code_invalid' }
    }
  }

  // email_confirm: true es DELIBERADO. El piloto no tiene SMTP propio ni
  // dominio para enviar correos de confirmación, así que no podemos exigirla
  // aquí. Queda aplazada a cuando exista un dominio y SMTP propios.
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    })

  if (createError || !created?.user) {
    if (createError?.code === 'email_exists') {
      return { ok: false, reason: 'email_taken' }
    }
    return { ok: false, reason: 'unexpected' }
  }

  const newUserId = created.user.id

  if (codeHash !== null) {
    const { error: redeemError } = await admin.rpc(
      'redeem_invitation_for_new_member',
      {
        code_hash: codeHash,
        new_user_id: newUserId,
      },
    )

    if (redeemError) {
      // Acción compensatoria CRÍTICA: nunca debe quedar una cuenta autenticada
      // huérfana sin hogar, que es exactamente el fallo que estamos cerrando.
      const { error: deleteError } =
        await admin.auth.admin.deleteUser(newUserId)
      if (deleteError) {
        return { ok: false, reason: 'unexpected' }
      }
      return { ok: false, reason: 'code_invalid' }
    }
  }

  return { ok: true }
}
