'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  claimHouseholdPerson,
  createInvitationCode,
  resetPilotHousehold,
  revokeInvitation,
  type HouseholdManagement,
} from './actions'

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function HouseholdManager({ data }: { data: HouseholdManagement }) {
  const router = useRouter()
  const [resetConfirmation, setResetConfirmation] = useState('')
  const [status, setStatus] = useState('')
  const [generatedCode, setGeneratedCode] = useState<{
    code: string
    expiresAt: string
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const [claimName, setClaimName] = useState('')
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

  function generateCode() {
    startTransition(async () => {
      try {
        const result = await createInvitationCode()
        setGeneratedCode(result)
        setStatus('')
      } catch {
        setGeneratedCode(null)
        setStatus('No hemos podido generar el código. Inténtalo de nuevo.')
      }
    })
  }

  function revoke(id: string) {
    startTransition(async () => {
      try {
        await revokeInvitation(id)
        setGeneratedCode(null)
        setStatus('Hemos retirado el código de invitación.')
      } catch {
        setStatus('No pudimos retirar el código. Inténtalo de nuevo.')
      }
    })
  }

  function claimPerson(input: { personId: string } | { name: string }) {
    startTransition(async () => {
      try {
        await claimHouseholdPerson(input)
        setClaimName('')
        setStatus('')
      } catch {
        setStatus('No hemos podido guardar tu nombre. Inténtalo de nuevo.')
      }
    })
  }

  function resetPilot() {
    if (resetConfirmation !== 'BORRAR') {
      setStatus('Escribe BORRAR para confirmar el reinicio.')
      return
    }

    startTransition(async () => {
      try {
        await resetPilotHousehold(resetConfirmation)
        await createSupabaseBrowserClient().auth.signOut()
        window.location.replace('/login')
      } catch {
        setStatus('No hemos podido reiniciar el piloto. Inténtalo de nuevo.')
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
              <span>
                {member.isSelf ? (
                  <span
                    className="household-access-you"
                    aria-hidden="true"
                    title="Esta sesión"
                  />
                ) : null}
                {member.label}
                {member.isSelf ? (
                  <span className="sr-only"> (esta sesión)</span>
                ) : null}
              </span>
              <span className="household-access-role">
                {member.role === 'owner' ? 'Propietaria' : 'Integrante'}
              </span>
            </li>
          ))}
        </ul>
      </>

      {data.needsNameClaim ? (
        <section className="household-security">
          <p className="label">¿Cómo te llamas?</p>
          {data.unclaimedPeople.length ? (
            <p>Elige tu nombre de la lista, o escribe el tuyo si no está.</p>
          ) : (
            <p>Escribe tu nombre para que el resto del hogar te reconozca.</p>
          )}
          {data.unclaimedPeople.length ? (
            <div className="pantry-detail__chips">
              {data.unclaimedPeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  disabled={pending}
                  onClick={() => claimPerson({ personId: person.id })}
                >
                  {person.name}
                </button>
              ))}
            </div>
          ) : null}
          <label htmlFor="claim-name" className="sr-only">
            Tu nombre
          </label>
          <input
            id="claim-name"
            value={claimName}
            onChange={(event) => setClaimName(event.target.value)}
            placeholder="Nombre o apodo"
            disabled={pending}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={pending || !claimName.trim()}
            onClick={() => claimPerson({ name: claimName.trim() })}
          >
            Guardar mi nombre
          </button>
        </section>
      ) : null}

      <section className="household-security">
        <p className="label">Tu cuenta</p>
        <Link className="text-action" href="/auth/update-password">
          Cambiar mi contraseña
        </Link>
      </section>

      {data.isOwner ? (
        <div className="household-invite">
          <p className="label">Invitar a otra persona</p>
          {generatedCode ? (
            <div className="household-invite-code" aria-live="polite">
              <p className="household-invite-code__value">
                {generatedCode.code}
              </p>
              <p>
                Dale este código a la otra persona. Lo necesita para crear su
                cuenta. Caduca el {formatExpiry(generatedCode.expiresAt)}.
              </p>
              <p>
                Este código solo se muestra ahora: si se pierde, basta con
                generar otro (el anterior queda invalidado).
              </p>
            </div>
          ) : null}
          <PrimaryButton
            onClick={generateCode}
            disabled={pending}
            disabledReason={
              !data.isOwner
                ? 'Solo quien creó el hogar puede invitar a otra persona.'
                : hasFreeSpot
                  ? undefined
                  : 'El hogar ya tiene dos personas con acceso.'
            }
          >
            Generar código de invitación
          </PrimaryButton>
        </div>
      ) : (
        <p>Solo quien creó el hogar puede invitar a otra persona.</p>
      )}

      {data.pendingInvitations.length ? (
        <>
          <p className="label">Invitaciones pendientes</p>
          <ul className="household-invitations">
            {data.pendingInvitations.map((invitation) => (
              <li key={invitation.id}>
                <span>
                  Código pendiente · caduca el{' '}
                  {formatExpiry(invitation.expiresAt)}
                </span>
                {data.isOwner ? (
                  <span className="household-invitations__actions">
                    <button
                      type="button"
                      className="text-action"
                      onClick={() => revoke(invitation.id)}
                      disabled={pending}
                    >
                      Retirar
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

      {data.isOwner ? (
        <section className="household-reset">
          <p className="label">Reiniciar pruebas</p>
          <p>
            Borra este hogar, sus datos y las {data.activeMemberCount}{' '}
            {data.activeMemberCount === 1 ? 'cuenta activa' : 'cuentas activas'}
            . Después podrás registrar cuentas nuevas desde cero.
          </p>
          <label htmlFor="pilot-reset-confirmation">
            Escribe BORRAR para continuar
          </label>
          <input
            id="pilot-reset-confirmation"
            value={resetConfirmation}
            onChange={(event) => setResetConfirmation(event.target.value)}
            autoComplete="off"
            disabled={pending}
          />
          <button
            type="button"
            className="danger-button"
            onClick={resetPilot}
            disabled={pending || resetConfirmation !== 'BORRAR'}
          >
            Borrar hogar y cuentas de prueba
          </button>
        </section>
      ) : null}

      <p aria-live="polite">{status}</p>
    </section>
  )
}
