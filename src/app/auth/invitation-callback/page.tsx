'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

import { persistInvitationSession } from '@/lib/auth/invitation-session'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { getPublicSupabaseEnvironment } from '@/lib/supabase/env'
import type { Database } from '@/types/database'

export default function InvitationCallbackPage() {
  const [message, setMessage] = useState('Estamos abriendo tu invitación…')

  useEffect(() => {
    async function completeInvitationSignIn() {
      const { url, anonKey } = getPublicSupabaseEnvironment()
      // La invitación se solicita desde el servidor y, por tanto, el navegador
      // no tiene un verificador PKCE. Leemos el token implícito del fragmento y
      // lo copiamos inmediatamente al cliente SSR respaldado por cookies.
      const implicitClient = createClient<Database>(url, anonKey, {
        auth: {
          flowType: 'implicit',
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: true,
        },
      })
      const {
        data: { session },
        error,
      } = await implicitClient.auth.getSession()
      if (error || !session) {
        setMessage('No hemos podido validar este enlace. Solicita una nueva invitación.')
        return
      }

      await persistInvitationSession(session, createSupabaseBrowserClient())
      window.location.replace('/onboarding')
    }

    void completeInvitationSignIn().catch(() => {
      setMessage('No hemos podido abrir la invitación. Inténtalo de nuevo.')
    })
  }, [])

  return (
    <main className="auth-main">
      <section className="onboarding-card">
        <h1>Accediendo al hogar</h1>
        <p aria-live="polite">{message}</p>
      </section>
    </main>
  )
}
