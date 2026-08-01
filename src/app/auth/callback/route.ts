import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { getPublicSupabaseEnvironment } from '@/lib/supabase/env'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const requestedNext = url.searchParams.get('next')
  const nextPath =
    requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/onboarding'
  // Redirección con destino RELATIVO. `request.url` reporta la dirección de
  // escucha del servidor ("localhost") en los Route Handlers de Node, no el
  // Host que envió el cliente, así que redirigir a ese origen mandaba el
  // navegador a un host distinto del que acaba de recibir la cookie de sesión
  // y parecía que no había entrado. La solución anterior era reconstruir el
  // origen con la cabecera Host, pero esa cabecera la controla quien llama
  // (auditoría 2026-07-31). Una ruta relativa la resuelve el navegador contra
  // el origen real: no hay nada que reconstruir ni en qué confiar.
  const response = new NextResponse(null, {
    status: 302,
    headers: { Location: nextPath },
  })
  // access_token/refresh_token: solo los usan las pruebas E2E, que verifican el
  // enlace mágico vía la API de administrador (flujo implícito, sin `code` de
  // PKCE) para no depender de un correo real. Los enlaces reales usan `code`.
  //
  // La puerta de entorno es OBLIGATORIA, no una nota (auditoría 2026-07-31):
  // aceptar una sesión escrita en la URL fuera del arnés E2E permite fijación
  // de sesión —un enlace con los tokens del atacante deja a la víctima dentro
  // de SU cuenta— y filtra los tokens por logs, historial y cabecera Referer.
  const e2eAuthEnabled = process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED === 'true'
  const accessToken = e2eAuthEnabled
    ? url.searchParams.get('access_token')
    : null
  const refreshToken = e2eAuthEnabled
    ? url.searchParams.get('refresh_token')
    : null
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
