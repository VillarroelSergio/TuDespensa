import { describe, expect, it } from 'vitest'

import {
  isDevelopmentAccountEnabled,
  isDevelopmentAuthBypassEnabled,
} from './development-mode'

describe('isDevelopmentAuthBypassEnabled', () => {
  it('keeps the local UI-only bypass outside E2E', () => {
    expect(isDevelopmentAuthBypassEnabled('development', undefined)).toBe(true)
  })

  it('enables real Supabase Auth when an E2E server is requested', () => {
    expect(isDevelopmentAuthBypassEnabled('development', 'true')).toBe(false)
  })

  it('uses real local Auth when the persistent development account is enabled', () => {
    expect(
      isDevelopmentAuthBypassEnabled('development', undefined, 'true'),
    ).toBe(false)
    expect(isDevelopmentAccountEnabled('development', 'true')).toBe(true)
  })

  it('never bypasses Auth outside development', () => {
    expect(isDevelopmentAuthBypassEnabled('production', 'true')).toBe(false)
    expect(isDevelopmentAccountEnabled('production', 'true')).toBe(false)
  })
})
