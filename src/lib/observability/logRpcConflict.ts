import { headers } from 'next/headers'

type RpcError = { code?: string; message: string }

const lastLoggedAt = new Map<string, number>()
const LOG_INTERVAL_MS = 60_000

/**
 * Registra un conflicto de versión (40001) de una RPC versionada. Sirve para
 * distinguir un conflicto normal (otra persona cambió el ítem) de una
 * petición duplicada o un bucle de cliente reintentando la misma versión.
 * Nunca incluye secretos, JWT, la clave idempotente completa, PII ni
 * contenido de producto (nombre de alimento, ingredientes, etc.): solo la
 * operación, el código de error, el ítem y la versión pedida, y el
 * identificador de petición de Vercel si existe.
 */
export async function logRpcConflict(
  operation: string,
  error: RpcError,
  args: Record<string, unknown>,
) {
  const itemId = typeof args.item_id === 'string' ? args.item_id : undefined
  const requestedVersion =
    typeof args.version === 'number' ? args.version : undefined
  const fingerprint = `${operation}:${itemId ?? 'none'}:${requestedVersion ?? 'none'}`
  const now = Date.now()
  const last = lastLoggedAt.get(fingerprint)
  // Una tormenta no debe trasladarse a los logs de Vercel. Conservamos una
  // muestra por mutación/ítem/versión cada minuto para poder identificarla.
  if (last && now - last < LOG_INTERVAL_MS) return
  lastLoggedAt.set(fingerprint, now)
  const requestId = (await headers()).get('x-vercel-id') ?? undefined
  console.warn('[rpc-conflict]', {
    operation,
    errorCode: error.code,
    itemId,
    requestedVersion,
    requestId,
  })
}
