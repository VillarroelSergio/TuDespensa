import { describe, expect, it } from 'vitest'

import {
  INVITATION_CODE_ALPHABET,
  generateInvitationCode,
  hashInvitationCode,
  normalizeInvitationCode,
} from './invitation-code'

describe('generateInvitationCode', () => {
  it('produces a code with a dash in the middle, 11 characters long', () => {
    const code = generateInvitationCode()
    expect(code).toHaveLength(11)
    expect(code[5]).toBe('-')
  })

  it('produces 10 alphabet characters once the dash is removed', () => {
    const code = generateInvitationCode()
    const withoutDash = code.replace('-', '')
    expect(withoutDash).toHaveLength(10)
    expect(
      withoutDash
        .split('')
        .every((char) => INVITATION_CODE_ALPHABET.includes(char)),
    ).toBe(true)
  })

  it('generates different codes on consecutive calls', () => {
    const first = generateInvitationCode()
    const second = generateInvitationCode()
    expect(first).not.toBe(second)
  })
})

describe('normalizeInvitationCode', () => {
  it('accepts the same code lowercase, with spaces, without a dash, or with extra dashes', () => {
    const canonical = 'ABCDEF2345'
    expect(normalizeInvitationCode('abcde-f2345')).toBe(canonical)
    expect(normalizeInvitationCode('ABCDE F2345')).toBe(canonical)
    expect(normalizeInvitationCode('ABCDEF2345')).toBe(canonical)
    expect(normalizeInvitationCode('-ABCDE--F2345-')).toBe(canonical)
  })

  it('maps ambiguous characters O, I and L to 0, 1 and 1', () => {
    expect(normalizeInvitationCode('OIL234567I')).toBe('0112345671')
  })

  it('returns null for the wrong length', () => {
    expect(normalizeInvitationCode('ABCDE-F234')).toBeNull() // 9 useful chars
    expect(normalizeInvitationCode('ABCDE-F23456')).toBeNull() // 11 useful chars
  })

  it('returns null when it contains characters outside the alphabet', () => {
    expect(normalizeInvitationCode('ABCDE-U2345')).toBeNull() // U is not in the alphabet
  })
})

describe('hashInvitationCode', () => {
  it('returns 64 lowercase hex characters', () => {
    const hash = hashInvitationCode(generateInvitationCode())
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable across equivalent ways of writing the same code', () => {
    const hashA = hashInvitationCode('abcde-f2345')
    const hashB = hashInvitationCode('ABCDEF2345')
    expect(hashA).toBe(hashB)
    expect(hashA).not.toBeNull()
  })

  it('produces different hashes for different codes', () => {
    const hashA = hashInvitationCode('ABCDE-F2345')
    const hashB = hashInvitationCode('ABCDE-F2346')
    expect(hashA).not.toBe(hashB)
  })

  it('returns null for invalid input', () => {
    expect(hashInvitationCode('too-short')).toBeNull()
  })
})
