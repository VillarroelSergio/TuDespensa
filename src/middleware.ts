import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getPublicSupabaseEnvironment } from '@/lib/supabase/env'
import type { Database } from '@/types/database'

const appPaths = ['/despensa', '/compra', '/recetas', '/plan']
const protectedPaths = ['/onboarding', ...appPaths]

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
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
    .eq('status', 'active')
    .maybeSingle()
  const { data: household } = membership
    ? await supabase
        .from('households')
        .select('onboarding_status')
        .eq('id', membership.household_id)
        .maybeSingle()
    : { data: null }
  const completed = household?.onboarding_status === 'completed'
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
