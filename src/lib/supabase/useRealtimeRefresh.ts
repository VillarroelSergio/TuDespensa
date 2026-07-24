'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from './browser'

type Options = {
  /** Desactiva la suscripción (p. ej. en fixtures visuales). */
  enabled?: boolean
  /** Si devuelve false, se ignora ese refresco (p. ej. mientras confirmamos). */
  shouldRefresh?: () => boolean
}

/**
 * Suscribe una pantalla a cambios de varias tablas y refresca los datos del
 * servidor cuando llegan. Frente al patrón anterior:
 *  - NO refresca en la primera conexión: los datos SSR ya son frescos, así que
 *    la recarga completa al entrar era pura latencia desperdiciada.
 *  - SÍ refresca al reconectar: Realtime no reenvía los eventos perdidos.
 *  - Agrupa (debounce) ráfagas de eventos en un único refresco.
 */
export function useRealtimeRefresh(
  channelName: string,
  tables: string[],
  { enabled = true, shouldRefresh }: Options = {},
) {
  const router = useRouter()
  const shouldRefreshRef = useRef(shouldRefresh)
  const tablesRef = useRef(tables)
  // tables es un literal nuevo en cada render; la clave evita re-suscribir.
  const tablesKey = tables.join('|')

  // Mantiene los refs al día sin escribirlos durante el render.
  useEffect(() => {
    shouldRefreshRef.current = shouldRefresh
    tablesRef.current = tables
  })

  useEffect(() => {
    if (!enabled) return
    const client = createSupabaseBrowserClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    let connectedOnce = false

    const refresh = () => {
      if (shouldRefreshRef.current && !shouldRefreshRef.current()) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), 200)
    }

    let channel = client.channel(channelName)
    for (const table of tablesRef.current) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        refresh,
      )
    }
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      if (connectedOnce) refresh()
      else connectedOnce = true
    })

    return () => {
      if (timer) clearTimeout(timer)
      void client.removeChannel(channel)
    }
  }, [channelName, tablesKey, enabled, router])
}
