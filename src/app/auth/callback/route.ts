import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { getPublicSupabaseEnvironment } from '@/lib/supabase/env'

export async function GET(request: NextRequest) {
  const url = new URL(request.url); const code = url.searchParams.get('code'); const response = NextResponse.redirect(new URL('/onboarding', url.origin));
  if (code) { const { url: supabaseUrl, anonKey } = getPublicSupabaseEnvironment(); const supabase = createServerClient<Database>(supabaseUrl, anonKey, { cookies: { getAll: () => request.cookies.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } }); await supabase.auth.exchangeCodeForSession(code) }
  return response
}
