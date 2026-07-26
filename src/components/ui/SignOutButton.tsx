'use client'

import { useState } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export function SignOutButton({ className = '' }: { className?: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function signOut() {
    setPending(true)
    setError('')
    const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut()

    if (signOutError) {
      setError('No hemos podido cerrar la sesión. Inténtalo de nuevo.')
      setPending(false)
      return
    }

    window.location.replace('/login')
  }

  return (
    <div className={`sign-out ${className}`}>
      <button type="button" className="text-action" onClick={signOut} disabled={pending}>
        {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
      {error ? <p role="status">{error}</p> : null}
    </div>
  )
}
