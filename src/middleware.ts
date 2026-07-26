import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getPublicSupabaseEnvironment } from '@/lib/supabase/env'
import { isDevelopmentAuthBypassEnabled } from '@/lib/auth/development-mode'
import type { Database } from '@/types/database'

const appPaths = ['/despensa', '/compra', '/recetas', '/plan', '/hogar']
const protectedPaths = ['/onboarding', ...appPaths]

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
  // El middleware solo protege la sesión y el estado de onboarding. La
  // verificación adicional del navegador queda desactivada temporalmente para
  // que el acceso dependa únicamente de correo y contraseña.
  const { data: context } = await supabase.rpc('middleware_context', {
    browser_token: null,
  })
  const row = Array.isArray(context) ? context[0] : context
  const completed = row?.onboarding_status === 'completed'
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
