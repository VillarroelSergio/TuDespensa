'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AppShell } from '@/components/ui/AppShell'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { formatQuantity } from '@/modules/shopping/presentation'

import type { CookPreview } from './actions'
import { cookMeal } from './actions'
import {
  buildConsumptions,
  cookReviewSummary,
  selectedCookLineCount,
} from './cooking'
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
      ? (APPROX_STATES.find((state) => state.value === line.approximateState)
          ?.label ?? 'Algo')
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
            onChange={(event) =>
              onChange({ discount: Number(event.target.value) })
            }
          />
          {line.unitCode ? <span>{line.unitCode}</span> : null}
        </label>
      )}
    </div>
  )
}

export function CookReview({
  preview,
  visualFixture = false,
}: {
  preview: CookPreview
  visualFixture?: boolean
}) {
  const router = useRouter()
  const [edits, setEdits] = useState<Record<string, CookEdit>>(() =>
    initialEdits(preview.lines),
  )
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const refresh = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    if (visualFixture) return
    const client = createSupabaseBrowserClient()
    const channel = client
      .channel('cook-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'planned_meals' },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pantry_items' },
        refresh,
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [refresh, visualFixture])

  const consumptions = useMemo(
    () => buildConsumptions(preview.lines, edits),
    [preview.lines, edits],
  )
  const summary = cookReviewSummary(preview.lines)
  const selectedCount = useMemo(
    () => selectedCookLineCount(preview.lines, edits),
    [preview.lines, edits],
  )

  function patch(itemId: string, next: Partial<CookEdit>) {
    setEdits((current) => {
      const previous = current[itemId] ?? {
        included: true,
        discount: 0,
        state: 'some' as const,
      }
      return { ...current, [itemId]: { ...previous, ...next } }
    })
  }

  async function handleConfirm() {
    if (pending) return
    setPending(true)
    setStatus('')
    try {
      const { consumed } = await cookMeal(
        preview.mealDate,
        preview.mealType,
        consumptions,
      )
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
    <AppShell current="plan" contentClassName="cook-page">
      <section aria-labelledby="cook-title">
        <a className="cook-back" href="/plan">
          ← Volver al plan
        </a>
        <header className="cook-header">
          <p className="cook-kicker">{summary.eyebrow}</p>
          <h1 id="cook-title">Cocinar «{preview.title}»</h1>
          <p>{slotLabel(preview.mealDate, preview.mealType)}</p>
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
        <section className="cook-overview" aria-label="Resumen de revisión">
          <p>{summary.message}</p>
          <span>
            {selectedCount}/{preview.lines.length} seleccionados
          </span>
        </section>
        {preview.lines.length ? (
          <>
            <p className="cook-instruction">
              Ajusta solo lo que hayas usado. Nada se cambia hasta confirmar.
            </p>
            <section
              className="cook-list"
              aria-label="Ingredientes a descontar"
            >
              {preview.lines.map((line) => {
                const edit = edits[line.itemId]
                if (!edit) return null
                return (
                  <CookRow
                    key={line.itemId}
                    line={line}
                    edit={edit}
                    onChange={(next) => patch(line.itemId, next)}
                  />
                )
              })}
            </section>
          </>
        ) : (
          <p className="shopping-empty">
            No hemos encontrado ingredientes de esta receta en tu despensa.
          </p>
        )}
        <button
          className="shopping-confirm"
          disabled={pending || preview.alreadyCooked}
          onClick={handleConfirm}
          type="button"
        >
          Marcar como cocinada
        </button>
      </section>
    </AppShell>
  )
}
