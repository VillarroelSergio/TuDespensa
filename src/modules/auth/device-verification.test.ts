import { describe, expect, it, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const signInWithOtp = vi.fn()
const verifyOtp = vi.fn()
const insert = vi.fn()
const eq = vi.fn()
const is = vi.fn()
const update = vi.fn()
const from = vi.fn()

const cookieSet = vi.fn()
const cookieDelete = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser, signInWithOtp, verifyOtp },
    from,
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: cookieSet,
    delete: cookieDelete,
  })),
}))

import {
  requestNewBrowserCode,
  verifyNewBrowserCode,
  revokeTrustedBrowsers,
} from './device-verification'

beforeEach(() => {
  vi.clearAllMocks()
  update.mockReturnValue({ eq: eq.mockReturnValue({ is }) })
  from.mockReturnValue({ insert, update })
})

describe('requestNewBrowserCode', () => {
  it('lanza error si no hay sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(requestNewBrowserCode()).rejects.toThrow('iniciar sesión')
  })

  it('envía el código OTP al email del usuario actual', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'a@b.com' } } })
    signInWithOtp.mockResolvedValue({ error: null })

    await expect(requestNewBrowserCode()).resolves.toEqual({ email: 'a@b.com' })
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      options: { shouldCreateUser: false },
    })
  })

  it('lanza error si Supabase falla al enviar el código', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'a@b.com' } } })
    signInWithOtp.mockResolvedValue({ error: new Error('boom') })
    await expect(requestNewBrowserCode()).rejects.toThrow(
      'No hemos podido enviar el código',
    )
  })
})

describe('verifyNewBrowserCode', () => {
  it('rechaza códigos que no son de 6 dígitos', async () => {
    await expect(verifyNewBrowserCode('12a45')).rejects.toThrow('seis dígitos')
    await expect(verifyNewBrowserCode('123')).rejects.toThrow('seis dígitos')
  })

  it('lanza error si no hay sesión activa', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(verifyNewBrowserCode('123456')).rejects.toThrow(
      'sesión ha caducado',
    )
  })

  it('lanza error si el código es inválido', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'a@b.com' } } })
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: new Error('bad code'),
    })
    await expect(verifyNewBrowserCode('123456')).rejects.toThrow(
      'El código no es válido',
    )
  })

  it('lanza error si no se puede insertar el navegador de confianza', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'a@b.com' } } })
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    insert.mockResolvedValue({ error: new Error('db down') })
    await expect(verifyNewBrowserCode('123456')).rejects.toThrow(
      'No hemos podido reconocer',
    )
  })

  it('marca el navegador como confiable y fija la cookie', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'a@b.com' } } })
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    insert.mockResolvedValue({ error: null })

    await expect(verifyNewBrowserCode('123456')).resolves.toBeUndefined()
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1' }),
    )
    expect(cookieSet).toHaveBeenCalledWith(
      'midespensa_trusted_browser',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: 30 * 86400 }),
    )
  })
})

describe('revokeTrustedBrowsers', () => {
  it('lanza error si no hay sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(revokeTrustedBrowsers()).rejects.toThrow('iniciar sesión')
  })

  it('revoca los navegadores de confianza del usuario y borra la cookie', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    is.mockResolvedValue({ error: null })

    await revokeTrustedBrowsers()

    expect(from).toHaveBeenCalledWith('trusted_browsers')
    expect(eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(is).toHaveBeenCalledWith('revoked_at', null)
    expect(cookieDelete).toHaveBeenCalledWith('midespensa_trusted_browser')
  })
})
