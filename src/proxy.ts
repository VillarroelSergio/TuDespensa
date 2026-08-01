import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getPublicSupabaseEnvironment } from '@/lib/supabase/env'
import { isDevelopmentAuthBypassEnabled } from '@/lib/auth/development-mode'
import {
  needsOnboardingGate,
  requiresSession,
  resolveOnboardingRedirect,
} from '@/lib/auth/access-decision'
import type { Database } from '@/types/database'

export async function proxy(request: NextRequest) {
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
  if (requiresSession(pathname) && !user) {
    const loginUrl = new URL('/login', request.url)
    // Vuelve al destino original tras autenticarse en vez de aterrizar siempre
    // en Despensa (auditoría 2026-07-29). Login valida esto antes de usarlo.
    loginUrl.searchParams.set('returnTo', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }
  if (!user) return response
  // Esta lógica solo decide redirecciones para rutas de onboarding; en el
  // resto (p.ej. /auth/update-password o páginas públicas ya con sesión) las
  // dos consultas siguientes no cambiarían nada (auditoría 2026-07-29).
  if (!needsOnboardingGate(pathname)) return response
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  let onboardingCompleted = false
  let needsInvitationCode = false
  let invitationCheckFailed = false

  if (membership) {
    const { data: household } = await supabase
      .from('households')
      .select('onboarding_status')
      .eq('id', membership.household_id)
      .maybeSingle()
    onboardingCompleted = household?.onboarding_status === 'completed'
  } else {
    // Sin membresía activa: hay que distinguir "el hogar ya existe pero esta
    // cuenta no es miembro" (necesita canjear un código en /unirme) de "aún no
    // existe ningún hogar" (esta cuenta va a crear el primero). RLS impide
    // correctamente que un no-miembro lea `households`, así que sin esta RPC no
    // hay forma de diferenciar ambos casos aquí, y el onboarding volvería a
    // ofrecer "crear hogar" a una cuenta que el trigger de hogar único
    // rechazaría. Solo se llama en esta rama: el caso habitual (ya con
    // membresía) no paga ese viaje de red.
    const { data, error } = await supabase.rpc('pilot_needs_invitation')
    needsInvitationCode = data === true
    invitationCheckFailed = Boolean(error)
  }

  const redirectTo = resolveOnboardingRedirect({
    pathname,
    hasActiveMembership: Boolean(membership),
    onboardingCompleted,
    needsInvitationCode,
    invitationCheckFailed,
  })

  return redirectTo
    ? NextResponse.redirect(new URL(redirectTo, request.url))
    : response
}

export const config = {
  // Los ficheros estáticos de /public también se excluyen (auditoría
  // 2026-07-31): antes cada uno pagaba una llamada de red a Supabase Auth solo
  // para acabar devolviendo el fichero.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest)$).*)',
  ],
}
