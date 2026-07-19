'use client'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: React.FormEvent) { event.preventDefault(); const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } }); setMessage(error ? 'No hemos podido enviar el acceso. Inténtalo de nuevo.' : 'Revisa tu correo para continuar.') }
  return <main className="auth-main"><section className="onboarding-card"><p className="eyebrow">MiDespensa</p><h1>Acceso privado</h1><p>Esta aplicación es solo para las cuentas autorizadas del hogar.</p><form onSubmit={submit}><label htmlFor="email">Correo autorizado</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><button className="primary-button">Enviar enlace de acceso</button></form><p aria-live="polite">{message}</p></section></main>
}
