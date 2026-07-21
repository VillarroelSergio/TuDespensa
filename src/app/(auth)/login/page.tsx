'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const isDevelopment = process.env.NODE_ENV === 'development'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (isDevelopment) {
      router.replace('/despensa')
      return
    }

    const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setMessage(
      error
        ? 'No hemos podido enviar el acceso. Inténtalo de nuevo.'
        : 'Revisa tu correo para continuar.',
    )
  }

  return (
    <main className="auth-main">
      <section className="onboarding-card">
        <p className="eyebrow">MiDespensa</p>
        <h1>{isDevelopment ? 'Acceso de desarrollo' : 'Acceso privado'}</h1>
        <p>
          {isDevelopment
            ? 'Escribe cualquier valor para abrir la interfaz local. La autenticación real sigue activa en producción.'
            : 'Esta aplicación es solo para las cuentas autorizadas del hogar.'}
        </p>
        <form onSubmit={submit}>
          <label htmlFor="email">
            {isDevelopment ? 'Identificador de prueba' : 'Correo autorizado'}
          </label>
          <input
            id="email"
            type={isDevelopment ? 'text' : 'email'}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className="primary-button">
            {isDevelopment ? 'Entrar en desarrollo' : 'Enviar enlace de acceso'}
          </button>
        </form>
        <p aria-live="polite">{message}</p>
      </section>
    </main>
  )
}
