// Decisiones de acceso del proxy, aisladas de Next y Supabase para poder
// probarlas (auditoría 2026-07-29: toda la protección de rutas vivía en
// `proxy.ts` sin un solo test). `proxy.ts` queda como envoltorio de E/S: aquí
// no se consulta nada, solo se decide a partir del estado ya resuelto.

export const APP_PATHS = [
  '/despensa',
  '/compra',
  '/recetas',
  '/plan',
  '/hogar',
] as const

const PROTECTED_PATHS = [
  '/onboarding',
  '/unirme',
  '/auth/update-password',
  ...APP_PATHS,
]

function matches(pathname: string, paths: readonly string[]): boolean {
  return paths.some((path) => pathname.startsWith(path))
}

export function isAppPath(pathname: string): boolean {
  return matches(pathname, APP_PATHS)
}

/** Rutas que exigen sesión: sin ella, el proxy manda a /login. */
export function requiresSession(pathname: string): boolean {
  return matches(pathname, PROTECTED_PATHS)
}

/**
 * Solo estas rutas pueden acabar en una redirección de onboarding. Para el
 * resto, el proxy se ahorra las consultas de membresía y hogar.
 */
export function needsOnboardingGate(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/unirme' ||
    pathname.startsWith('/onboarding') ||
    isAppPath(pathname)
  )
}

export type OnboardingState = {
  pathname: string
  hasActiveMembership: boolean
  /** Solo se consulta cuando hay membresía activa. */
  onboardingCompleted: boolean
  /** Solo se consulta cuando NO hay membresía activa. */
  needsInvitationCode: boolean
  /** La RPC `pilot_needs_invitation` falló: se decide fallando cerrado. */
  invitationCheckFailed: boolean
}

/** Devuelve la ruta a la que redirigir, o null para dejar pasar. */
export function resolveOnboardingRedirect(
  state: OnboardingState,
): string | null {
  const { pathname } = state

  if (state.hasActiveMembership) {
    const completed = state.onboardingCompleted
    if (pathname === '/unirme') return completed ? '/despensa' : '/onboarding'
    if (
      completed &&
      (pathname === '/login' || pathname.startsWith('/onboarding'))
    )
      return '/despensa'
    if (!completed && isAppPath(pathname)) return '/onboarding'
    if (pathname === '/login') return '/onboarding'
    return null
  }

  // Sin membresía activa. Fallar CERRADO si no se pudo determinar si esta
  // cuenta necesita código: /unirme es una pantalla informativa con salida por
  // "cerrar sesión", mientras que dejarla pasar al onboarding la llevaría a
  // chocar con el trigger de hogar único.
  if (state.invitationCheckFailed || state.needsInvitationCode) {
    return pathname === '/unirme' ? null : '/unirme'
  }

  if (pathname === '/unirme' || pathname === '/login' || isAppPath(pathname))
    return '/onboarding'
  return null
}
