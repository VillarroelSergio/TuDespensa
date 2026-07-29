import { headers } from 'next/headers'

/**
 * Registra la duración de una carga de página cara (Despensa, Compra, selector
 * del Plan). Mismo formato que `logRpcConflict`: solo ruta, fase, duración y el
 * identificador de petición de Vercel si existe — sin PII ni contenido de
 * producto.
 */
export async function withPhaseTiming<T>(
  phase: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now()
  try {
    return await fn()
  } finally {
    const durationMs = Math.round(performance.now() - startedAt)
    const requestId = (await headers()).get('x-vercel-id') ?? undefined
    console.info('[phase]', { phase, durationMs, requestId })
  }
}
