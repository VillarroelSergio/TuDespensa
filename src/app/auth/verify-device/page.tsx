'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestNewBrowserCode, verifyNewBrowserCode } from '@/modules/auth/device-verification'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export default function VerifyDevicePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('Te enviaremos un código a tu correo para reconocer este navegador.')
  const [pending, setPending] = useState(false)

  async function sendCode() {
    setPending(true)
    try { await requestNewBrowserCode(); setMessage('Código enviado. Revisa tu correo.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No hemos podido enviar el código.') }
    finally { setPending(false) }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); setPending(true)
    try { await verifyNewBrowserCode(code); router.replace('/despensa'); router.refresh() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No hemos podido verificar el código.') }
    finally { setPending(false) }
  }
  async function switchAccount() {
    setPending(true)
    await createSupabaseBrowserClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }
  return <main className="auth-main"><section className="onboarding-card"><h1>Confirma este navegador</h1><p>Solo te lo pediremos de nuevo si revocas este navegador o deja de ser confiable.</p><button className="secondary-button" type="button" onClick={sendCode} disabled={pending}>Enviar código</button><form onSubmit={verify}><label htmlFor="device-code">Código de seis dígitos</label><input id="device-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required /><button className="primary-button" disabled={pending}>Confirmar navegador</button></form><button className="text-action" type="button" onClick={switchAccount} disabled={pending}>Usar otra cuenta</button><p aria-live="polite">{message}</p></section></main>
}
