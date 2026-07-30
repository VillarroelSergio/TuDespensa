'use client'

import { useRealtimeRefresh } from '@/lib/supabase/useRealtimeRefresh'

/**
 * Suscribe una pantalla renderizada en servidor a cambios en tiempo real. Los
 * componentes de servidor no pueden usar el hook directamente, así que montan
 * esta pieza cliente, que no pinta nada (auditoría 2026-07-29).
 */
export function RealtimeRefresh({
  channel,
  tables,
}: {
  channel: string
  tables: string[]
}) {
  useRealtimeRefresh(channel, tables)
  return null
}
