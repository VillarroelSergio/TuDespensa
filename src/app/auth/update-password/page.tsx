'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    if (password.length < 8) {
      setMessage('La contraseña debe tener al menos ocho caracteres.')
      return
    }
    if (password !== confirmation) {
      setMessage('Las dos contraseñas no coinciden.')
      return
    }

    const { error } = await createSupabaseBrowserClient().auth.updateUser({
      password,
    })
    if (error) {
      setMessage(
        'No hemos podido cambiar la contraseña. Comprueba que tu sesión sigue activa e inténtalo de nuevo.',
      )
      return
    }

    setMessage('Contraseña actualizada.')
    router.replace('/hogar')
    router.refresh()
  }

  return (
    <main className="auth-main">
      <section className="onboarding-card">
        <h1>Cambiar tu contraseña</h1>
        <form onSubmit={submit}>
          <label htmlFor="new-password">Nueva contraseña</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label htmlFor="confirm-password">Repite la nueva contraseña</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <button className="primary-button">Guardar contraseña</button>
        </form>
        <p aria-live="polite">{message}</p>
      </section>
    </main>
  )
}
