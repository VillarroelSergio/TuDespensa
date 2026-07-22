'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { BrandLockup } from '@/components/ui/BrandLockup'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { isDevelopmentAuthBypassEnabled } from '@/lib/auth/development-mode'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const isDevelopmentBypassEnabled = isDevelopmentAuthBypassEnabled(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED,
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (isDevelopmentBypassEnabled) {
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
        <BrandLockup className="brand brand--welcome" href="/" />
        <h1>
          {isDevelopmentBypassEnabled
            ? 'Acceso de desarrollo'
            : 'Acceso privado'}
        </h1>
        <p>
          {isDevelopmentBypassEnabled
            ? 'Escribe cualquier valor para abrir la interfaz local. La autenticación real sigue activa en producción.'
            : 'Esta aplicación es solo para las cuentas autorizadas del hogar.'}
        </p>
        <form onSubmit={submit}>
          <label htmlFor="email">
            {isDevelopmentBypassEnabled
              ? 'Identificador de prueba'
              : 'Correo autorizado'}
          </label>
          <input
            id="email"
            type={isDevelopmentBypassEnabled ? 'text' : 'email'}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className="primary-button">
            {isDevelopmentBypassEnabled
              ? 'Entrar en desarrollo'
              : 'Enviar enlace de acceso'}
          </button>
        </form>
        <p aria-live="polite">{message}</p>
      </section>
    </main>
  )
}
