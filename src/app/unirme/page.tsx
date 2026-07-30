'use client'

import { useState } from 'react'

import { BrandLockup } from '@/components/ui/BrandLockup'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { SignOutButton } from '@/components/ui/SignOutButton'
import { redeemInvitationCode } from '@/modules/household/actions'

export default function JoinHouseholdPage() {
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const result = await redeemInvitationCode(code)
      if (!result.ok) {
        setMessage(
          'Ese código no es válido o ha caducado. Pídele uno nuevo a la otra persona.',
        )
        return
      }
      // Recarga completa a propósito: el middleware tiene que reevaluar la
      // sesión con la membresía nueva antes de decidir a dónde llevarte.
      window.location.assign('/despensa')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-main">
      <section className="onboarding-card">
        <BrandLockup className="brand brand--welcome" href="/" />
        <h1>Únete a tu hogar</h1>
        <p>
          La persona que ya usa MiDespensa puede generar un código en la
          pantalla Hogar. Pídeselo y escríbelo aquí para unirte.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="invitation-code">Código de invitación</label>
          <input
            id="invitation-code"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <PrimaryButton disabled={pending}>Unirme al hogar</PrimaryButton>
        </form>
        <p aria-live="polite">{message}</p>
        <SignOutButton />
      </section>
    </main>
  )
}
