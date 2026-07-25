'use server'

import { randomBytes, createHash } from 'crypto'
import { cookies } from 'next/headers'

import { createSupabaseServerClient } from '@/lib/supabase/server'

const DEVICE_COOKIE = 'midespensa_trusted_browser'
const DEVICE_LIFETIME_DAYS = 30

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function requestNewBrowserCode() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Necesitas iniciar sesión antes de verificar este navegador.')

  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  })
  if (error) throw new Error('No hemos podido enviar el código. Inténtalo de nuevo más tarde.')
  return { email: user.email }
}

export async function verifyNewBrowserCode(token: string) {
  if (!/^\d{6}$/.test(token)) throw new Error('Introduce el código de seis dígitos.')
  const supabase = await createSupabaseServerClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser?.email) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')

  const { data, error } = await supabase.auth.verifyOtp({
    email: currentUser.email,
    token,
    // Supabase stores the codes sent by this signed-in device flow in
    // auth.users.recovery_token. Verifying them as `email` rejects every
    // freshly issued code; `recovery` matches the token Supabase issued.
    type: 'recovery',
  })
  if (error || !data.user) throw new Error('El código no es válido o ha caducado.')

  const browserToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + DEVICE_LIFETIME_DAYS * 86400000).toISOString()
  const { error: trustError } = await supabase.from('trusted_browsers').insert({
    user_id: data.user.id,
    token_hash: tokenHash(browserToken),
    expires_at: expiresAt,
  })
  if (trustError) throw new Error('No hemos podido reconocer este navegador.')

  const cookieStore = await cookies()
  cookieStore.set(DEVICE_COOKIE, browserToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_LIFETIME_DAYS * 86400,
  })
}

export async function revokeTrustedBrowsers() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Necesitas iniciar sesión.')
  await supabase.from('trusted_browsers').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id).is('revoked_at', null)
  ;(await cookies()).delete(DEVICE_COOKIE)
}
