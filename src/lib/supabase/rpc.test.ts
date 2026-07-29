import { describe, expect, it } from 'vitest'

import { AppError } from '@/lib/errors/AppError'

import { failure, toAppErrorCode } from './rpc'

// La tabla vivía duplicada en los seis módulos de acciones y ya había
// divergido; este test es lo que impide que vuelva a pasar (auditoría
// 2026-07-29).
describe('toAppErrorCode', () => {
  it.each([
    ['42501', 'FORBIDDEN'],
    ['40001', 'CONFLICT'],
    ['23505', 'CONFLICT'],
    ['22023', 'INVALID_INPUT'],
    ['23514', 'INVALID_INPUT'],
    ['22P02', 'INVALID_INPUT'],
  ])('traduce %s a %s', (code, expected) => {
    expect(toAppErrorCode(code)).toBe(expected)
  })

  it.each([undefined, '', 'XX000', '08006'])(
    'usa UNEXPECTED para %s',
    (code) => {
      expect(toAppErrorCode(code)).toBe('UNEXPECTED')
    },
  )
})

describe('failure', () => {
  it('lanza un AppError con el código traducido y el mensaje original', () => {
    try {
      failure({ code: '42501', message: 'permission denied' })
      expect.unreachable('failure siempre lanza')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('FORBIDDEN')
      expect((error as AppError).message).toBe('permission denied')
    }
  })
})
