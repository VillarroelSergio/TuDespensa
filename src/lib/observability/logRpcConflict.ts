import { headers } from 'next/headers'

type RpcError = { code?: string; message: string }

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
  const requestId = (await headers()).get('x-vercel-id') ?? undefined
  console.warn('[rpc-conflict]', {
    operation,
    errorCode: error.code,
    itemId: typeof args.item_id === 'string' ? args.item_id : undefined,
    requestedVersion:
      typeof args.version === 'number' ? args.version : undefined,
    requestId,
  })
}
