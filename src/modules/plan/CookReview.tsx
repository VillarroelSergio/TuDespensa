'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { formatQuantity } from '@/modules/shopping/presentation'

import type { CookPreview } from './actions'
import { cookMeal } from './actions'
import { buildConsumptions } from './cooking'
import type { CookEdit, CookLine } from './cooking'
import { slotLabel } from './presentation'

const APPROX_STATES: { value: string; label: string }[] = [
  { value: 'plenty', label: 'De sobra' },
  { value: 'some', label: 'Algo' },
  { value: 'low', label: 'Queda poco' },
  { value: 'out', label: 'Agotado' },
]

function initialEdits(lines: CookLine[]): Record<string, CookEdit> {
  return Object.fromEntries(
    lines.map((line) => [
      line.itemId,
      {
        included: true,
        discount: line.proposedDiscount ?? 0,
        state: line.proposedState ?? line.approximateState ?? 'some',
      },
    ]),
  )
}

/** Una fila editable: descontar una cantidad o bajar el nivel de un aproximado. */
function CookRow({
  line,
  edit,
  onChange,
}: {
  line: CookLine
  edit: CookEdit
  onChange: (patch: Partial<CookEdit>) => void
}) {
  const current =
    line.trackingMode === 'approximate'
      ? (APPROX_STATES.find((state) => state.value === line.approximateState)?.label ??
        'Algo')
      : (formatQuantity(line.quantity, line.unitCode) ?? 'Sin cantidad')

  return (
    <div className="cook-row">
      <label className="cook-row__toggle">
        <input
          type="checkbox"
          checked={edit.included}
          onChange={(event) => onChange({ included: event.target.checked })}
        />
        <span className="cook-row__name">{line.name}</span>
      </label>
      <small className="cook-row__current">Tienes: {current}</small>
      {line.trackingMode === 'approximate' ? (
        <label className="cook-row__field">
          Se queda en
          <select
            value={edit.state}
            disabled={!edit.included}
            onChange={(event) => onChange({ state: event.target.value })}
          >
            {APPROX_STATES.map((state) => (
              <option key={state.value} value={state.value}>
                {state.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="cook-row__field">
          Descontar
          <input
            type="number"
            min={0}
            max={line.quantity ?? undefined}
            step="any"
            value={edit.discount}
            disabled={!edit.included}
            onChange={(event) => onChange({ discount: Number(event.target.value) })}
          />
          {line.unitCode ? <span aria-hidden="true">{line.unitCode}</span> : null}
        </label>
      )}
    </div>
  )
}

export function CookReview({ preview }: { preview: CookPreview }) {
  const router = useRouter()
  const [edits, setEdits] = useState<Record<string, CookEdit>>(() =>
    initialEdits(preview.lines),
  )
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const refresh = useCallback(() => router.refresh(), [router])

  // Si otro integrante cocina la comida o cambia un producto, recargamos la
  // revisión en vivo en vez de descontar sobre datos viejos.
  useEffect(() => {
    const client = createSupabaseBrowserClient()
    const channel = client
      .channel('cook-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planned_meals' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items' }, refresh)
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [refresh])

  const consumptions = useMemo(
    () => buildConsumptions(preview.lines, edits),
    [preview.lines, edits],
  )

  function patch(itemId: string, next: Partial<CookEdit>) {
    setEdits((current) => ({ ...current, [itemId]: { ...current[itemId], ...next } }))
  }

  async function handleConfirm() {
    if (pending) return
    setPending(true)
    setStatus('')
    try {
      const { consumed } = await cookMeal(preview.mealDate, preview.mealType, consumptions)
      router.push(`/plan?cocinada=${consumed}`)
    } catch {
      setStatus(
        'Algo cambió mientras revisabas. Hemos actualizado la despensa; compruébala y vuelve a confirmar.',
      )
      setPending(false)
      refresh()
    }
  }

  return (
    <main className="shopping-page">
      <aside className="shopping-sidebar">
        <a className="pantry-brand" href="/plan">
          <span aria-hidden="true" /> MiDespensa
        </a>
      </aside>
      <section className="shopping-content" aria-labelledby="cook-title">
        <a className="shopping-back" href="/plan">
          ← Volver al plan
        </a>
        <header className="shopping-header">
          <h1 id="cook-title">Cocinar «{preview.title}»</h1>
          <p className="shopping-review-lead">{slotLabel(preview.mealDate, preview.mealType)}</p>
        </header>

        {preview.alreadyCooked ? (
          <p className="plan-notice" role="status">
            Esta comida ya estaba marcada como cocinada.
          </p>
        ) : null}
        {status ? (
          <p className="pantry-sync-status" aria-live="polite">
            {status}
          </p>
        ) : null}

        {preview.lines.length ? (
          <>
            <p className="shopping-review-lead">
              Ajusta lo que hayas usado antes de descontarlo de tu despensa:
            </p>
            <section className="cook-list" aria-label="Ingredientes a descontar">
              {preview.lines.map((line) => (
                <CookRow
                  key={line.itemId}
                  line={line}
                  edit={edits[line.itemId]}
                  onChange={(next) => patch(line.itemId, next)}
                />
              ))}
            </section>
            <button
              className="shopping-confirm"
              disabled={pending || preview.alreadyCooked}
              onClick={handleConfirm}
              type="button"
            >
              Marcar como cocinada
            </button>
          </>
        ) : (
          <>
            <p className="shopping-empty">
              No hemos encontrado ingredientes de esta receta en tu despensa, así que no
              hay nada que descontar.
            </p>
            <button
              className="shopping-confirm"
              disabled={pending || preview.alreadyCooked}
              onClick={handleConfirm}
              type="button"
            >
              Marcar como cocinada
            </button>
          </>
        )}
      </section>
    </main>
  )
}
