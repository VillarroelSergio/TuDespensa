import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { getPublicSupabaseEnvironment } from '@/lib/supabase/env'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  // request.url reports the dev server's own bind address ("localhost") in
  // Node.js Route Handlers, not the Host header the client actually sent —
  // unlike Edge middleware, which mirrors it faithfully. Redirecting to that
  // origin sends the browser to a different host than the one holding the
  // just-set session cookie, so it looks logged out. Rebuild the origin from
  // the real Host header instead.
  const origin = `${url.protocol}//${request.headers.get('host') ?? url.host}`
  const requestedNext = url.searchParams.get('next')
  const nextPath = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/onboarding'
  const response = NextResponse.redirect(new URL(nextPath, origin))
  // access_token/refresh_token: solo los usan las pruebas E2E, que verifican el
  // enlace mágico vía la API de administrador (flujo implícito, sin `code` de
  // PKCE) para no depender de un correo real. Los enlaces reales usan `code`.
  const accessToken = url.searchParams.get('access_token')
  const refreshToken = url.searchParams.get('refresh_token')
  if (code || (accessToken && refreshToken)) {
    const { url: supabaseUrl, anonKey } = getPublicSupabaseEnvironment()
    const supabase = createServerClient<Database>(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    })
    if (code) await supabase.auth.exchangeCodeForSession(code)
    else
      await supabase.auth.setSession({
        access_token: accessToken!,
        refresh_token: refreshToken!,
      })
  }
  return response
}
