import { describe, expect, it } from 'vitest'

import {
  APP_PATHS,
  needsOnboardingGate,
  requiresSession,
  resolveOnboardingRedirect,
  type OnboardingState,
} from './access-decision'

function state(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    pathname: '/despensa',
    hasActiveMembership: true,
    onboardingCompleted: true,
    needsInvitationCode: false,
    invitationCheckFailed: false,
    ...overrides,
  }
}

describe('requiresSession', () => {
  it.each([...APP_PATHS])('protege %s', (path) => {
    expect(requiresSession(path)).toBe(true)
  })

  it('protege las subrutas, no solo el prefijo exacto', () => {
    expect(requiresSession('/recetas/123/editar')).toBe(true)
    expect(requiresSession('/plan/cocinar')).toBe(true)
  })

  it.each(['/onboarding', '/unirme', '/auth/update-password'])(
    'protege %s',
    (path) => {
      expect(requiresSession(path)).toBe(true)
    },
  )

  it.each(['/', '/login', '/auth/callback'])('deja pasar %s', (path) => {
    expect(requiresSession(path)).toBe(false)
  })
})

describe('needsOnboardingGate', () => {
  it.each(['/login', '/unirme', '/onboarding', '/despensa', '/plan/cocinar'])(
    'evalúa %s',
    (path) => {
      expect(needsOnboardingGate(path)).toBe(true)
    },
  )

  // Ahorra dos consultas por petición en las rutas que nunca redirigen.
  it.each(['/', '/auth/update-password', '/auth/callback'])(
    'se salta las consultas en %s',
    (path) => {
      expect(needsOnboardingGate(path)).toBe(false)
    },
  )
})

describe('resolveOnboardingRedirect con membresía activa', () => {
  it('deja pasar a la app cuando el onboarding está completo', () => {
    expect(
      resolveOnboardingRedirect(state({ pathname: '/despensa' })),
    ).toBeNull()
  })

  it('saca de /login y /onboarding a quien ya terminó', () => {
    expect(resolveOnboardingRedirect(state({ pathname: '/login' }))).toBe(
      '/despensa',
    )
    expect(resolveOnboardingRedirect(state({ pathname: '/onboarding' }))).toBe(
      '/despensa',
    )
  })

  it('retiene en el onboarding a quien no lo ha terminado', () => {
    const pending = { onboardingCompleted: false }
    expect(
      resolveOnboardingRedirect(state({ ...pending, pathname: '/despensa' })),
    ).toBe('/onboarding')
    expect(
      resolveOnboardingRedirect(state({ ...pending, pathname: '/login' })),
    ).toBe('/onboarding')
    expect(
      resolveOnboardingRedirect(state({ ...pending, pathname: '/onboarding' })),
    ).toBeNull()
  })

  it('no deja a un miembro en /unirme: ya tiene hogar', () => {
    expect(resolveOnboardingRedirect(state({ pathname: '/unirme' }))).toBe(
      '/despensa',
    )
    expect(
      resolveOnboardingRedirect(
        state({ pathname: '/unirme', onboardingCompleted: false }),
      ),
    ).toBe('/onboarding')
  })
})

describe('resolveOnboardingRedirect sin membresía activa', () => {
  const outsider = { hasActiveMembership: false, onboardingCompleted: false }

  it('manda a /unirme a quien necesita código', () => {
    const needsCode = { ...outsider, needsInvitationCode: true }
    expect(
      resolveOnboardingRedirect(state({ ...needsCode, pathname: '/despensa' })),
    ).toBe('/unirme')
    expect(
      resolveOnboardingRedirect(
        state({ ...needsCode, pathname: '/onboarding' }),
      ),
    ).toBe('/unirme')
    expect(
      resolveOnboardingRedirect(state({ ...needsCode, pathname: '/unirme' })),
    ).toBeNull()
  })

  // Regresión: si la RPC falla no se puede saber si la cuenta necesita código.
  // Dejarla pasar al onboarding la llevaría a chocar con el trigger de hogar
  // único, así que se falla CERRADO hacia /unirme.
  it('falla cerrado cuando no se puede comprobar si necesita código', () => {
    const failed = { ...outsider, invitationCheckFailed: true }
    expect(
      resolveOnboardingRedirect(state({ ...failed, pathname: '/despensa' })),
    ).toBe('/unirme')
    expect(
      resolveOnboardingRedirect(state({ ...failed, pathname: '/unirme' })),
    ).toBeNull()
  })

  it('falla cerrado aunque la comprobación diga que no hace falta código', () => {
    expect(
      resolveOnboardingRedirect(
        state({
          ...outsider,
          pathname: '/despensa',
          needsInvitationCode: false,
          invitationCheckFailed: true,
        }),
      ),
    ).toBe('/unirme')
  })

  it('lleva al onboarding a la cuenta que va a crear el primer hogar', () => {
    const founder = { ...outsider, needsInvitationCode: false }
    expect(
      resolveOnboardingRedirect(state({ ...founder, pathname: '/despensa' })),
    ).toBe('/onboarding')
    expect(
      resolveOnboardingRedirect(state({ ...founder, pathname: '/unirme' })),
    ).toBe('/onboarding')
    expect(
      resolveOnboardingRedirect(state({ ...founder, pathname: '/login' })),
    ).toBe('/onboarding')
    expect(
      resolveOnboardingRedirect(state({ ...founder, pathname: '/onboarding' })),
    ).toBeNull()
  })
})
