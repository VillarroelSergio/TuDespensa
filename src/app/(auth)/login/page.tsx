'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { BrandLockup } from '@/components/ui/BrandLockup'
import {
  isDevelopmentAccountEnabled,
  isDevelopmentAuthBypassEnabled,
} from '@/lib/auth/development-mode'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

const DEV_ACCOUNT_EMAIL = 'admin@midespensa.local'
const DEV_ACCOUNT_PASSWORD = 'admin'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const isDevelopmentBypassEnabled = isDevelopmentAuthBypassEnabled(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED,
    process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED,
  )
  const isDevelopmentAccount = isDevelopmentAccountEnabled(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED,
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (isDevelopmentBypassEnabled) {
      router.replace('/despensa')
      return
    }

    if (isDevelopmentAccount) {
      if (email.trim().toLowerCase() !== 'admin') {
        setMessage('Para el entorno local usa el identificador admin.')
        return
      }
      const { error } = await createSupabaseBrowserClient().auth.signInWithPassword(
        {
          email: DEV_ACCOUNT_EMAIL,
          password: DEV_ACCOUNT_PASSWORD,
        },
      )
      if (error) {
        setMessage(
          'No se encuentra la cuenta local. Ejecuta npm run dev:reset una vez.',
        )
        return
      }
      router.replace('/despensa')
      router.refresh()
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

  const localMode = isDevelopmentBypassEnabled || isDevelopmentAccount

  return (
    <main className="auth-main">
      <section className="onboarding-card">
        <BrandLockup className="brand brand--welcome" href="/" />
        <h1>{localMode ? 'Acceso de desarrollo' : 'Acceso privado'}</h1>
        <p>
          {isDevelopmentBypassEnabled
            ? 'Escribe cualquier valor para abrir la interfaz local. La autenticación real sigue activa en producción.'
            : isDevelopmentAccount
              ? 'Escribe admin para abrir la cuenta local con datos sintéticos persistentes. Solo existe en desarrollo.'
              : 'Esta aplicación es solo para las cuentas autorizadas del hogar.'}
        </p>
        <form onSubmit={submit}>
          <label htmlFor="email">
            {localMode ? 'Identificador de prueba' : 'Correo autorizado'}
          </label>
          <input
            id="email"
            type={localMode ? 'text' : 'email'}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className="primary-button">
            {localMode ? 'Entrar en desarrollo' : 'Enviar enlace de acceso'}
          </button>
        </form>
        <p aria-live="polite">{message}</p>
      </section>
    </main>
  )
}
