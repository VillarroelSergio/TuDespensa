'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { BrandLockup } from '@/components/ui/BrandLockup'
import {
  isDevelopmentAccountEnabled,
  isDevelopmentAuthBypassEnabled,
} from '@/lib/auth/development-mode'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  registerAccount,
  type RegistrationResult,
} from '@/modules/auth/registration'

const DEV_ACCOUNT_EMAIL = 'admin@midespensa.local'
const DEV_ACCOUNT_PASSWORD = 'admin'

type RegistrationFailureReason = Extract<
  RegistrationResult,
  { ok: false }
>['reason']

const REGISTRATION_ERROR_MESSAGES: Record<RegistrationFailureReason, string> = {
  code_required:
    'Necesitas un código de invitación. Pídeselo a la persona que ya usa MiDespensa.',
  code_invalid:
    'Ese código no es válido o ha caducado. Pídele uno nuevo a la otra persona.',
  bootstrap_unavailable:
    'El alta de la primera cuenta está cerrada. Hay que configurar el código de arranque (PILOT_BOOTSTRAP_CODE) en el servidor.',
  email_taken:
    'Ya existe una cuenta con ese correo. Entra con tu contraseña; si te han invitado, podrás escribir el código justo después.',
  invalid_input: 'Revisa el correo y usa una contraseña de ocho caracteres o más.',
  rate_limited:
    'Demasiados intentos seguidos. Espera un cuarto de hora y vuelve a probar.',
  unexpected: 'No hemos podido crear la cuenta. Inténtalo de nuevo.',
}

// Solo rutas protegidas conocidas: evita un open redirect vía ?returnTo=.
const RETURNABLE_PATH = /^\/(despensa|compra|recetas|plan|hogar)(\/|\?|$)/

function LoginForm() {
  const router = useRouter()
  const returnToParam = useSearchParams().get('returnTo')
  const returnTo =
    returnToParam && RETURNABLE_PATH.test(returnToParam)
      ? returnToParam
      : '/despensa'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const bypass = isDevelopmentAuthBypassEnabled(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED,
    process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED,
  )
  const devAccount = isDevelopmentAccountEnabled(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED,
  )
  const localMode = bypass || devAccount

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (bypass) {
      router.replace(returnTo)
      return
    }

    const client = createSupabaseBrowserClient()

    if (devAccount) {
      if (email.trim().toLowerCase() !== 'admin') {
        setMessage('Para el entorno local usa el identificador admin.')
        return
      }
      const { error } = await client.auth.signInWithPassword({
        email: DEV_ACCOUNT_EMAIL,
        password: DEV_ACCOUNT_PASSWORD,
      })
      if (error) {
        setMessage('No se encuentra la cuenta local. Ejecuta npm run dev:reset una vez.')
        return
      }
      router.replace(returnTo)
      router.refresh()
      return
    }

    if (mode === 'register') {
      setPending(true)
      try {
        const result = await registerAccount({
          email,
          password,
          code: code.trim() || undefined,
        })
        if (!result.ok) {
          setMessage(REGISTRATION_ERROR_MESSAGES[result.reason])
          return
        }
        const { error } = await client.auth.signInWithPassword({ email, password })
        if (error) {
          setMessage('El correo o la contraseña no son correctos.')
          return
        }
        router.replace(returnTo)
        router.refresh()
      } finally {
        setPending(false)
      }
      return
    }

    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage('El correo o la contraseña no son correctos.')
      return
    }
    router.replace(returnTo)
    router.refresh()
  }

  const title = localMode
    ? 'Acceso de desarrollo'
    : mode === 'register'
      ? 'Crea tu cuenta'
      : 'Acceso privado'

  return (
    <main className="auth-main">
      <section className="onboarding-card">
        <BrandLockup className="brand brand--welcome" href="/" />
        <h1>{title}</h1>
        <p>
          {bypass
            ? 'Escribe cualquier valor para abrir la interfaz local.'
            : devAccount
              ? 'Escribe admin para abrir la cuenta local con datos sintéticos.'
              : 'Entra con tu correo y contraseña.'}
        </p>
        <form onSubmit={submit}>
          <label htmlFor="email">{localMode ? 'Identificador de prueba' : 'Correo'}</label>
          <input
            id="email"
            type={localMode ? 'text' : 'email'}
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {!localMode ? (
            <>
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </>
          ) : null}
          {!localMode && mode === 'register' ? (
            <>
              <label htmlFor="invitation-code">Código de invitación</label>
              <input
                id="invitation-code"
                type="text"
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <p>
                Si eres la primera persona que usa MiDespensa, escribe el
                código de arranque del piloto.
              </p>
            </>
          ) : null}
          <button className="primary-button" disabled={pending}>
            {localMode ? 'Entrar en desarrollo' : mode === 'register' ? 'Crear cuenta' : 'Entrar'}
          </button>
        </form>
        {!localMode ? (
          <p className="auth-links">
            {mode === 'register' ? (
              <button
                className="text-action"
                onClick={() => setMode('login')}
                type="button"
              >
                Ya tengo cuenta
              </button>
            ) : (
              <button
                className="text-action"
                onClick={() => setMode('register')}
                type="button"
              >
                Crear cuenta
              </button>
            )}
          </p>
        ) : null}
        {!localMode && mode === 'login' ? (
          <p>
            ¿Has olvidado la contraseña? Durante el piloto todavía no podemos
            enviarte un correo para recuperarla. Pídele a la otra persona del
            hogar que te ayude desde la pantalla Hogar.
          </p>
        ) : null}
        {/* role="status" para que el error de acceso se anuncie: solo con
            aria-live algunos lectores no lo recogen. */}
        <p aria-live="polite" role="status">
          {message}
        </p>
      </section>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
