'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const { error } = await createSupabaseBrowserClient().auth.updateUser({ password })
    if (error) { setMessage('No hemos podido actualizar la contraseña. Solicita un nuevo enlace.'); return }
    router.replace('/despensa'); router.refresh()
  }
  return <main className="auth-main"><section className="onboarding-card"><h1>Elige una nueva contraseña</h1><form onSubmit={submit}><label htmlFor="new-password">Nueva contraseña</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="primary-button">Guardar contraseña</button></form><p aria-live="polite">{message}</p></section></main>
}
