import { revalidatePath } from 'next/cache'

import { AppError, type AppErrorCode } from '@/lib/errors/AppError'
import { logRpcConflict } from '@/lib/observability/logRpcConflict'
import { isRpcConflictResult } from '@/lib/observability/rpcConflict'

import { createSupabaseServerClient } from './server'

export type PostgresFailure = { code?: string; message: string }

// Tabla ÚNICA de códigos de PostgreSQL. Antes cada módulo llevaba su propia
// copia y ya habían divergido: 23505 era INVALID_INPUT en despensa, CONFLICT en
// hogar y UNEXPECTED en los otros cuatro (auditoría 2026-07-29).
const POSTGRES_ERROR_CODES: Record<string, AppErrorCode> = {
  '42501': 'FORBIDDEN', // insufficient_privilege
  '40001': 'CONFLICT', // serialization_failure
  '23505': 'CONFLICT', // unique_violation: la fila ya existe
  '22023': 'INVALID_INPUT', // invalid_parameter_value
  '23514': 'INVALID_INPUT', // check_violation
  '22P02': 'INVALID_INPUT', // invalid_text_representation
}

export function toAppErrorCode(code?: string): AppErrorCode {
  return (code && POSTGRES_ERROR_CODES[code]) || 'UNEXPECTED'
}

export function failure(error: PostgresFailure): never {
  throw new AppError(toAppErrorCode(error.code), error.message)
}

const CONFLICT_FALLBACK: PostgresFailure = {
  code: '40001',
  message: 'Item was changed, unavailable, or inaccessible',
}

/**
 * Llama a una RPC y traduce el fallo a `AppError`. Un conflicto optimista puede
 * llegar de dos formas: como error `40001` o como resultado `{status:
 * 'conflict'}` (migración 20260728170658, que evita el rollback). Ambas se
 * registran para poder medirlos en producción.
 */
export async function callRpc<T>(
  name: string,
  args: Record<string, unknown>,
  revalidate: readonly string[] = [],
): Promise<T> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(name as never, args as never)
  if (error || isRpcConflictResult(data)) {
    const failed = error ?? CONFLICT_FALLBACK
    if (error?.code === '40001' || isRpcConflictResult(data)) {
      await logRpcConflict(name, failed, args)
    }
    failure(failed)
  }
  revalidate.forEach((path) => revalidatePath(path))
  return data as T
}
