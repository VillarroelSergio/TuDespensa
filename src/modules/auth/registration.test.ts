import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createUser = vi.fn()
const deleteUser = vi.fn()
const rpc = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    auth: { admin: { createUser, deleteUser } },
    rpc,
  })),
}))

// El límite de intentos cuenta por procedencia. Cada prueba estrena la suya
// para no gastarse el cupo entre unas y otras; la prueba del propio límite fija
// la suya a propósito.
const caller = { ip: '' }
let callerSeq = 0

vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => (name === 'x-forwarded-for' ? caller.ip : null),
    }),
}))

import { registerAccount } from './registration'
import { hashInvitationCode } from './invitation-code'

/**
 * `registerAccount` hace dos llamadas RPC distintas: primero
 * `pilot_household_exists` (¿hace falta código?) y después, solo si hay
 * código, `redeem_invitation_for_new_member`. Este ayudante las distingue por
 * nombre para que ninguna prueba pueda dar por buena la respuesta de la otra.
 */
function mockRpc(options: {
  householdExists?: boolean
  householdCheckError?: unknown
  redeemError?: unknown
}) {
  rpc.mockImplementation((name: string) => {
    if (name === 'pilot_household_exists')
      return Promise.resolve({
        data: options.householdCheckError
          ? null
          : (options.householdExists ?? false),
        error: options.householdCheckError ?? null,
      })
    return Promise.resolve({
      data: options.redeemError ? null : { household_id: 'household-1' },
      error: options.redeemError ?? null,
    })
  })
}

const BOOTSTRAP_CODE = 'arranque-piloto'

beforeEach(() => {
  vi.clearAllMocks()
  callerSeq += 1
  caller.ip = `203.0.113.${callerSeq}`
  process.env.PILOT_BOOTSTRAP_CODE = BOOTSTRAP_CODE
  createUser.mockResolvedValue({
    data: { user: { id: 'new-user-id' } },
    error: null,
  })
})

afterEach(() => {
  delete process.env.PILOT_BOOTSTRAP_CODE
})

describe('registerAccount', () => {
  it('creates the first account when the bootstrap code matches', async () => {
    mockRpc({ householdExists: false })

    const result = await registerAccount({
      email: 'first@example.com',
      password: 'password1',
      code: BOOTSTRAP_CODE,
    })

    expect(result).toEqual({ ok: true })
    expect(createUser).toHaveBeenCalledWith({
      email: 'first@example.com',
      password: 'password1',
      email_confirm: true,
    })
    // La primera cuenta no canjea invitación: solo se consulta si hay hogar.
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('pilot_household_exists')
  })

  // Regresión: sin hogar todavía, este Server Action público creaba cuentas
  // sin credencial alguna, así que permitía altas masivas (auditoría
  // 2026-07-29).
  it('refuses to create the first account without the bootstrap code', async () => {
    mockRpc({ householdExists: false })

    const result = await registerAccount({
      email: 'intruder@example.com',
      password: 'password1',
    })

    expect(result).toEqual({ ok: false, reason: 'code_required' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('refuses to create the first account with a wrong bootstrap code', async () => {
    mockRpc({ householdExists: false })

    const result = await registerAccount({
      email: 'intruder@example.com',
      password: 'password1',
      code: 'no-es-el-codigo',
    })

    expect(result).toEqual({ ok: false, reason: 'code_invalid' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('fails closed when no bootstrap code is configured on the server', async () => {
    delete process.env.PILOT_BOOTSTRAP_CODE
    mockRpc({ householdExists: false })

    const result = await registerAccount({
      email: 'intruder@example.com',
      password: 'password1',
      code: 'lo-que-sea',
    })

    expect(result).toEqual({ ok: false, reason: 'bootstrap_unavailable' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('requires a code when a household already exists', async () => {
    mockRpc({ householdExists: true })

    const result = await registerAccount({
      email: 'second@example.com',
      password: 'password1',
    })

    expect(result).toEqual({ ok: false, reason: 'code_required' })
    expect(createUser).not.toHaveBeenCalled()
  })

  // Regresión: la comprobación se hacía leyendo `households` con la clave de
  // servicio, que NO tiene permiso sobre esa tabla. El error se ignoraba y el
  // registro quedaba abierto sin código aunque el hogar ya existiera.
  it('creates no account when it cannot tell whether a household exists', async () => {
    mockRpc({ householdCheckError: { message: 'permission denied' } })

    const result = await registerAccount({
      email: 'intruder@example.com',
      password: 'password1',
    })

    expect(result).toEqual({ ok: false, reason: 'unexpected' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('rejects a malformed code without creating the account', async () => {
    mockRpc({ householdExists: true })

    const result = await registerAccount({
      email: 'second@example.com',
      password: 'password1',
      code: 'too-short',
    })

    expect(result).toEqual({ ok: false, reason: 'code_invalid' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('creates the account and redeems a valid code', async () => {
    mockRpc({ householdExists: true })
    const code = 'ABCDE-F2345'

    const result = await registerAccount({
      email: 'second@example.com',
      password: 'password1',
      code,
    })

    expect(result).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('redeem_invitation_for_new_member', {
      code_hash: hashInvitationCode(code),
      new_user_id: 'new-user-id',
    })
  })

  it('deletes the just-created account when redemption is rejected, leaving no orphan', async () => {
    mockRpc({
      householdExists: true,
      redeemError: new Error('invalid or expired'),
    })
    deleteUser.mockResolvedValue({ error: null })

    const result = await registerAccount({
      email: 'second@example.com',
      password: 'password1',
      code: 'ABCDE-F2345',
    })

    expect(deleteUser).toHaveBeenCalledWith('new-user-id')
    expect(result).toEqual({ ok: false, reason: 'code_invalid' })
  })

  it('reports unexpected when the compensating delete also fails', async () => {
    mockRpc({
      householdExists: true,
      redeemError: new Error('invalid or expired'),
    })
    deleteUser.mockResolvedValue({ error: new Error('delete failed') })

    const result = await registerAccount({
      email: 'second@example.com',
      password: 'password1',
      code: 'ABCDE-F2345',
    })

    expect(result).toEqual({ ok: false, reason: 'unexpected' })
  })

  it('reports email_taken when the address is already registered', async () => {
    mockRpc({ householdExists: false })
    createUser.mockResolvedValue({
      data: { user: null },
      error: {
        code: 'email_exists',
        message: 'Email address already registered',
      },
    })

    const result = await registerAccount({
      email: 'first@example.com',
      password: 'password1',
      code: BOOTSTRAP_CODE,
    })

    expect(result).toEqual({ ok: false, reason: 'email_taken' })
  })

  it('rejects a password shorter than 8 characters without creating the account', async () => {
    const result = await registerAccount({
      email: 'first@example.com',
      password: 'short',
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_input' })
    expect(createUser).not.toHaveBeenCalled()
  })

  // Sin este freno, el código de arranque —que lo escribe una persona a mano—
  // se puede probar por fuerza bruta: la acción es invocable sin sesión y sin
  // límite (auditoría 2026-07-31).
  it('stops brute force after five failed attempts from the same caller', async () => {
    mockRpc({ householdExists: false })
    const attempt = () =>
      registerAccount({
        email: 'first@example.com',
        password: 'password1',
        code: 'codigo-incorrecto',
      })

    for (let index = 0; index < 5; index += 1) {
      expect(await attempt()).toEqual({ ok: false, reason: 'code_invalid' })
    }

    expect(await attempt()).toEqual({ ok: false, reason: 'rate_limited' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('does not spend the quota of an unrelated caller', async () => {
    mockRpc({ householdExists: false })
    caller.ip = '198.51.100.7'

    const result = await registerAccount({
      email: 'first@example.com',
      password: 'password1',
      code: BOOTSTRAP_CODE,
    })

    expect(result).toEqual({ ok: true })
  })
})
