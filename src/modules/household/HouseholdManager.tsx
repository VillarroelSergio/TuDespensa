'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRealtimeRefresh } from '@/lib/supabase/useRealtimeRefresh'
import {
  claimHouseholdPerson,
  createInvitationCode,
  exportHouseholdBackup,
  resetPilotHousehold,
  restoreHouseholdBackup,
  revokeInvitation,
  type HouseholdManagement,
} from './actions'
import { downloadBackup, parseBackup, type HouseholdBackup } from './backup'

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function HouseholdManager({
  data,
  isVisualFixture = false,
}: {
  data: HouseholdManagement
  isVisualFixture?: boolean
}) {
  const router = useRouter()
  const [resetConfirmation, setResetConfirmation] = useState('')
  const [status, setStatus] = useState('')
  const [generatedCode, setGeneratedCode] = useState<{
    code: string
    expiresAt: string
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const [claimName, setClaimName] = useState('')
  const [backupToRestore, setBackupToRestore] = useState<HouseholdBackup | null>(null)
  const [restoreConfirmation, setRestoreConfirmation] = useState('')
  const hasFreeSpot = data.activeMemberCount < 2
  const canInvite = data.isOwner && hasFreeSpot

  // Antes duplicaba a mano la suscripción del hook común, sin su agrupación de
  // ráfagas de eventos (auditoría 2026-07-29).
  useRealtimeRefresh('household-membership-refresh', ['household_invitations'], {
    enabled: !isVisualFixture,
  })

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

  function createBackup() {
    startTransition(async () => {
      try {
        const backup = await exportHouseholdBackup()
        downloadBackup(backup)
        setStatus(
          `Copia descargada: ${backup.counts.recipes} recetas, ${backup.counts.shoppingItems} productos de Compra y ${backup.counts.pantryItems} productos de Despensa.`,
        )
      } catch {
        setStatus('No hemos podido crear la copia. Inténtalo de nuevo.')
      }
    })
  }

  async function selectBackup(file: File | undefined) {
    setBackupToRestore(null)
    setRestoreConfirmation('')
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      setStatus('La copia es demasiado grande para cargarla desde el navegador.')
      return
    }
    try {
      const backup = parseBackup(JSON.parse(await file.text()))
      if (!backup) throw new Error('invalid backup')
      setBackupToRestore(backup)
      setStatus('Copia preparada. Revisa el resumen y confirma la restauración.')
    } catch {
      setStatus('No reconocemos este archivo como una copia de MiDespensa.')
    }
  }

  function restoreBackup() {
    if (!backupToRestore || restoreConfirmation !== 'RESTAURAR') return
    startTransition(async () => {
      try {
        // Antes de tocar nada dejamos una salida local del estado actual.
        downloadBackup(await exportHouseholdBackup())
        await restoreHouseholdBackup(backupToRestore, restoreConfirmation)
        setRestoreConfirmation('')
        setBackupToRestore(null)
        setStatus('Hemos restaurado la copia. La pantalla se actualizará ahora.')
        router.refresh()
      } catch {
        setStatus('No hemos podido restaurar la copia. Tus datos actuales no se han borrado.')
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

      {/* Los rótulos de sección eran <p class="label">: visualmente parecían
          títulos, pero no existían como encabezados, así que con lector de
          pantalla la pantalla Hogar tenía un solo título para siete bloques. */}
      <section aria-labelledby="hogar-accesos">
        <h2 className="label" id="hogar-accesos">
          Cuentas con acceso
        </h2>
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
      </section>

      {data.needsNameClaim ? (
        <section className="household-security">
          <h2 className="label">¿Cómo te llamas?</h2>
          {data.unclaimedPeople.length ? (
            <p>Elige tu nombre de la lista, o escribe el tuyo si no está.</p>
          ) : (
            <p>Escribe tu nombre para que el resto del hogar te reconozca.</p>
          )}
          {data.unclaimedPeople.length ? (
            <div
              aria-label="Nombres disponibles"
              className="pantry-detail__chips"
              role="group"
            >
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
        <h2 className="label">Tu cuenta</h2>
        <Link className="text-action" href="/auth/update-password">
          Cambiar mi contraseña
        </Link>
      </section>

      <section className="household-backup">
        <h2 className="label">Copia de seguridad</h2>
        <p>
          Descarga una copia completa de tus Recetas, Compra y Despensa. No
          cambia nada en el hogar.
        </p>
        <p className="household-backup__notice">
          El archivo contiene información privada del hogar. Guárdalo en una
          carpeta segura, fuera de MiDespensa.
        </p>
        <PrimaryButton onClick={createBackup} disabled={pending}>
          Descargar copia de seguridad
        </PrimaryButton>
      </section>

      {data.isOwner ? (
        <section className="household-restore">
          <h2 className="label">Restaurar una copia</h2>
          <p>
            Recupera los datos de una copia de este mismo hogar. Antes se
            descargará automáticamente una copia del estado actual.
          </p>
          <p className="household-backup__notice">
            La restauración actualiza los datos incluidos en la copia, pero no
            borra productos o recetas añadidos después de ella.
          </p>
          <label htmlFor="backup-file">Elige una copia de MiDespensa</label>
          <input
            id="backup-file"
            type="file"
            accept="application/json,.json"
            disabled={pending}
            onChange={(event) => void selectBackup(event.target.files?.[0])}
          />
          {backupToRestore ? (
            <>
              <p>
                Copia de {backupToRestore.household.name}: {backupToRestore.counts.recipes}{' '}
                recetas, {backupToRestore.counts.shoppingItems} productos de Compra y{' '}
                {backupToRestore.counts.pantryItems} productos de Despensa.
              </p>
              <label htmlFor="backup-restore-confirmation">
                Escribe RESTAURAR para continuar
              </label>
              <input
                id="backup-restore-confirmation"
                value={restoreConfirmation}
                onChange={(event) => setRestoreConfirmation(event.target.value)}
                autoComplete="off"
                disabled={pending}
              />
              <button
                type="button"
                className="secondary-button"
                disabled={pending || restoreConfirmation !== 'RESTAURAR'}
                onClick={restoreBackup}
              >
                Restaurar esta copia
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {data.isOwner ? (
        <section className="household-invite">
          <h2 className="label">Invitar a otra persona</h2>
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
        </section>
      ) : (
        <p>Solo quien creó el hogar puede invitar a otra persona.</p>
      )}

      {data.pendingInvitations.length ? (
        <section aria-labelledby="hogar-invitaciones">
          <h2 className="label" id="hogar-invitaciones">
            Invitaciones pendientes
          </h2>
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
        </section>
      ) : canInvite ? (
        <p className="center">Aún no has invitado a nadie.</p>
      ) : null}

      {data.isOwner ? (
        <section className="household-reset">
          <h2 className="label">Reiniciar pruebas</h2>
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

      {/* role="status" además de aria-live: algunos lectores solo anuncian la
          región si tiene rol, y aquí llegan tanto confirmaciones como errores. */}
      <p aria-live="polite" role="status">
        {status}
      </p>
    </section>
  )
}
