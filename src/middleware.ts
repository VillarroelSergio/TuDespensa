import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getPublicSupabaseEnvironment } from '@/lib/supabase/env'
import { isDevelopmentAuthBypassEnabled } from '@/lib/auth/development-mode'
import type { Database } from '@/types/database'

const appPaths = ['/despensa', '/compra', '/recetas', '/plan', '/hogar']
const protectedPaths = [
  '/onboarding',
  '/unirme',
  '/auth/update-password',
  ...appPaths,
]

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  // Manual local UI work can skip Auth, but E2E explicitly opts into the real
  // Supabase session flow so RLS and server actions are exercised end-to-end.
  if (
    isDevelopmentAuthBypassEnabled(
      process.env.NODE_ENV,
      process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED,
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED,
    )
  )
    return response

  const { url, anonKey } = getPublicSupabaseEnvironment()
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  if (protectedPaths.some((path) => pathname.startsWith(path)) && !user)
    return NextResponse.redirect(new URL('/login', request.url))
  if (!user) return response
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (membership) {
    const { data: household } = await supabase
      .from('households')
      .select('onboarding_status')
      .eq('id', membership.household_id)
      .maybeSingle()
    const completed = household?.onboarding_status === 'completed'
    if (pathname === '/unirme')
      return NextResponse.redirect(
        new URL(completed ? '/despensa' : '/onboarding', request.url),
      )
    if (
      completed &&
      (pathname === '/login' || pathname.startsWith('/onboarding'))
    )
      return NextResponse.redirect(new URL('/despensa', request.url))
    if (!completed && appPaths.some((path) => pathname.startsWith(path)))
      return NextResponse.redirect(new URL('/onboarding', request.url))
    if (pathname === '/login')
      return NextResponse.redirect(new URL('/onboarding', request.url))
    return response
  }

  // Sin membresía activa: hay que distinguir "el hogar ya existe pero esta
  // cuenta no es miembro" (necesita canjear un código en /unirme) de "aún no
  // existe ningún hogar" (esta cuenta va a crear el primero). RLS impide
  // correctamente que un no-miembro lea `households`, así que sin esta RPC no
  // hay forma de diferenciar ambos casos aquí, y el onboarding volvería a
  // ofrecer "crear hogar" a una cuenta que el trigger de hogar único
  // rechazaría. Solo se llama en esta rama: el caso habitual (ya con
  // membresía) no paga ese viaje de red.
  const { data: needsInvitationCode, error: invitationCheckError } =
    await supabase.rpc('pilot_needs_invitation')

  // Fallar CERRADO: si no podemos determinar si esta cuenta necesita un
  // código (por ejemplo si la migración aún no está aplicada en este
  // entorno), la llevamos a /unirme, que es una pantalla informativa con
  // salida por "cerrar sesión". La alternativa —dejarla pasar al
  // onboarding— haría que intentara crear un segundo hogar y recibiera el
  // error crudo del trigger de hogar único, que es justo el defecto que
  // este rediseño elimina.
  if (invitationCheckError) {
    if (pathname !== '/unirme')
      return NextResponse.redirect(new URL('/unirme', request.url))
    return response
  }

  if (needsInvitationCode) {
    if (pathname !== '/unirme')
      return NextResponse.redirect(new URL('/unirme', request.url))
    return response
  }

  if (pathname === '/unirme')
    return NextResponse.redirect(new URL('/onboarding', request.url))
  if (pathname === '/login')
    return NextResponse.redirect(new URL('/onboarding', request.url))
  if (appPaths.some((path) => pathname.startsWith(path)))
    return NextResponse.redirect(new URL('/onboarding', request.url))
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
