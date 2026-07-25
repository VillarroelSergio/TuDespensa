'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandLockup } from '@/components/ui/BrandLockup'
import { isDevelopmentAccountEnabled, isDevelopmentAuthBypassEnabled } from '@/lib/auth/development-mode'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

const DEV_ACCOUNT_EMAIL = 'admin@midespensa.local'
const DEV_ACCOUNT_PASSWORD = 'admin'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login')
  const [message, setMessage] = useState('')
  const bypass = isDevelopmentAuthBypassEnabled(process.env.NODE_ENV, process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED, process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED)
  const devAccount = isDevelopmentAccountEnabled(process.env.NODE_ENV, process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED)
  const localMode = bypass || devAccount

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (bypass) { router.replace('/despensa'); return }
    const client = createSupabaseBrowserClient()
    if (devAccount) {
      if (email.trim().toLowerCase() !== 'admin') { setMessage('Para el entorno local usa el identificador admin.'); return }
      const { error } = await client.auth.signInWithPassword({ email: DEV_ACCOUNT_EMAIL, password: DEV_ACCOUNT_PASSWORD })
      if (error) { setMessage('No se encuentra la cuenta local. Ejecuta npm run dev:reset una vez.'); return }
      router.replace('/despensa'); router.refresh(); return
    }
    if (mode === 'recover') {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/auth/update-password` })
      setMessage(error ? 'No hemos podido enviar el enlace de recuperación.' : 'Revisa tu correo para restablecer la contraseña.')
      return
    }
    if (mode === 'register') {
      const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } })
      setMessage(error ? 'No hemos podido crear la cuenta.' : 'Revisa tu correo para confirmar tu cuenta.')
      return
    }
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) { setMessage('El correo o la contraseña no son correctos.'); return }
    router.replace('/despensa'); router.refresh()
  }

  const title = localMode ? 'Acceso de desarrollo' : mode === 'register' ? 'Crea tu cuenta' : mode === 'recover' ? 'Recupera tu acceso' : 'Acceso privado'
  return <main className="auth-main"><section className="onboarding-card"><BrandLockup className="brand brand--welcome" href="/" /><h1>{title}</h1><p>{bypass ? 'Escribe cualquier valor para abrir la interfaz local.' : devAccount ? 'Escribe admin para abrir la cuenta local con datos sintéticos.' : 'Entra con tu correo y contraseña. Los navegadores nuevos se confirman por correo.'}</p><form onSubmit={submit}><label htmlFor="email">{localMode ? 'Identificador de prueba' : 'Correo'}</label><input id="email" type={localMode ? 'text' : 'email'} autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />{!localMode && mode !== 'recover' ? <><label htmlFor="password">Contraseña</label><input id="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></> : null}<button className="primary-button">{localMode ? 'Entrar en desarrollo' : mode === 'register' ? 'Crear cuenta' : mode === 'recover' ? 'Enviar recuperación' : 'Entrar'}</button></form>{!localMode ? <p className="auth-links">{mode !== 'login' ? <button className="text-action" onClick={() => setMode('login')}>Ya tengo cuenta</button> : <><button className="text-action" onClick={() => setMode('register')}>Crear cuenta</button><button className="text-action" onClick={() => setMode('recover')}>He olvidado mi contraseña</button></>}</p> : null}<p aria-live="polite">{message}</p></section></main>
}
