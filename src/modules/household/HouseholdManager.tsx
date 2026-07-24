'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  inviteMember,
  resendInvitation,
  revokeInvitation,
  type HouseholdManagement,
} from './actions'

export function HouseholdManager({ data }: { data: HouseholdManagement }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [pending, startTransition] = useTransition()
  const hasFreeSpot = data.activeMemberCount < 2
  const canInvite = data.isOwner && hasFreeSpot

  useEffect(() => {
    const client = createSupabaseBrowserClient()
    const channel = client
      .channel('household-membership-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_invitations' },
        () => router.refresh(),
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [router])

  function invite(event: React.FormEvent) {
    event.preventDefault()
    const value = email.trim()
    if (!value) return
    startTransition(async () => {
      try {
        const result = await inviteMember(value)
        setEmail('')
        setStatus(
          result.emailSent
            ? `Invitación enviada a ${result.email}. Pídele que abra el enlace de su correo e inicie sesión.`
            : `Hemos guardado la invitación para ${result.email}, pero no pudimos enviar el correo. Usa «Reenviar».`,
        )
      } catch {
        setStatus(
          'No hemos podido invitar a ese correo. Revisa que sea válido y que aún haya sitio en el hogar.',
        )
      }
    })
  }

  function resend(value: string) {
    startTransition(async () => {
      const sent = await resendInvitation(value)
      setStatus(
        sent
          ? `Hemos reenviado el acceso a ${value}.`
          : `No pudimos reenviar el correo a ${value}. Inténtalo de nuevo.`,
      )
    })
  }

  function revoke(id: string) {
    startTransition(async () => {
      try {
        await revokeInvitation(id)
        setStatus('Hemos retirado la invitación.')
      } catch {
        setStatus('No pudimos retirar la invitación. Inténtalo de nuevo.')
      }
    })
  }

  return (
    <section className="household-manager">
      <h1>Hogar: {data.householdName}</h1>
      <p>
        {data.activeMemberCount === 1
          ? 'Ahora mismo solo tú tienes acceso.'
          : 'Dos personas tienen acceso a este hogar.'}
      </p>

      <>
        <p className="label">Cuentas con acceso</p>
        <ul className="household-people">
          {data.activeMembers.map((member) => (
            <li key={member.id}>
              <span>{member.label}</span>
              <span className="household-access-role">
                {member.role === 'owner' ? 'Propietaria' : 'Integrante'}
              </span>
            </li>
          ))}
        </ul>
      </>

      {data.isOwner ? (
        <form onSubmit={invite} className="household-invite">
          <label htmlFor="invite-email">Invitar por correo</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            placeholder="correo@ejemplo.com"
            onChange={(event) => setEmail(event.target.value)}
            disabled={!hasFreeSpot || pending}
          />
          <PrimaryButton
            onClick={invite}
            disabled={pending}
            disabledReason={
              hasFreeSpot
                ? undefined
                : 'El hogar ya tiene dos personas con acceso.'
            }
          >
            Enviar invitación
          </PrimaryButton>
        </form>
      ) : (
        <p>Solo quien creó el hogar puede invitar a otra persona.</p>
      )}

      {data.pendingInvitations.length ? (
        <>
          <p className="label">Invitaciones pendientes</p>
          <ul className="household-invitations">
            {data.pendingInvitations.map((invitation) => (
              <li key={invitation.id}>
                <span>{invitation.email}</span>
                {data.isOwner ? (
                  <span className="household-invitations__actions">
                    <button
                      type="button"
                      className="text-action"
                      onClick={() => resend(invitation.email)}
                      disabled={pending}
                    >
                      Reenviar
                    </button>
                    <button
                      type="button"
                      className="text-action"
                      onClick={() => revoke(invitation.id)}
                      disabled={pending}
                    >
                      Retirar acceso
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : canInvite ? (
        <p className="center">Aún no has invitado a nadie.</p>
      ) : null}

      <p aria-live="polite">{status}</p>
    </section>
  )
}
