import { describe, expect, it } from 'vitest'

import { isDevelopmentAuthBypassEnabled } from './development-mode'

describe('isDevelopmentAuthBypassEnabled', () => {
  it('keeps the local UI-only bypass outside E2E', () => {
    expect(isDevelopmentAuthBypassEnabled('development', undefined)).toBe(true)
  })

  it('enables real Supabase Auth when an E2E server is requested', () => {
    expect(isDevelopmentAuthBypassEnabled('development', 'true')).toBe(false)
  })

  it('never bypasses Auth outside development', () => {
    expect(isDevelopmentAuthBypassEnabled('production', 'true')).toBe(false)
  })
})
