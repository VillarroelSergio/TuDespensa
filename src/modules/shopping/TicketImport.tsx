'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { AppShell } from '@/components/ui/AppShell'

import { importTicketItems } from './actions'
import { parseTicketLines, type TicketLine } from './ticket'

const UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sin unidad' },
  { value: 'unit', label: 'uds.' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'l' },
]

const EMPTY_LINE: TicketLine = { name: '', quantity: null, unitCode: null }

// Fase 10: pegar el texto del ticket → revisar y corregir cada línea → añadir a
// Compra. La persona confirma lo detectado antes de que nada toque la lista.
export function TicketImport() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [lines, setLines] = useState<TicketLine[] | null>(null)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')

  function detect() {
    const detected = parseTicketLines(text)
    // Aunque no detecte nada, dejamos una fila vacía para escribir a mano.
    setLines(detected.length ? detected : [EMPTY_LINE])
    setStatus('')
  }

  function update(index: number, patch: Partial<TicketLine>) {
    setLines((current) =>
      (current ?? []).map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    )
  }

  function remove(index: number) {
    setLines((current) => (current ?? []).filter((_, i) => i !== index))
  }

  async function confirm() {
    const ready = (lines ?? []).filter((line) => line.name.trim().length > 0)
    if (pending || !ready.length) return
    setPending(true)
    setStatus('')
    try {
      const { added } = await importTicketItems(ready)
      router.push(`/compra?ticket=${added}`)
    } catch {
      setStatus('No hemos podido añadir el ticket. Puedes reintentarlo.')
      setPending(false)
    }
  }

  const usable = (lines ?? []).filter(
    (line) => line.name.trim().length > 0,
  ).length

  return (
    <AppShell current="compra" contentClassName="ticket-content">
      <section aria-labelledby="ticket-title">
        <Link className="shopping-back" href="/compra">
          <span aria-hidden="true">←</span> Volver a la lista
        </Link>
        <header className="shopping-header">
          <h1 id="ticket-title">Importar de un ticket</h1>
        </header>

        {lines === null ? (
          <>
            <p className="shopping-review-lead">
              Copia las líneas del ticket, una por producto. Podrás revisarlas y
              corregirlas antes de añadirlas.
            </p>
            <label className="sr-only" htmlFor="ticket-text">
              Texto del ticket
            </label>
            <textarea
              id="ticket-text"
              className="ticket-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder={'Tomate 500 g\nLeche 1,5 l\nManzanas 3'}
            />
            {!text.trim() ? (
              <p className="shopping-next" id="ticket-blocked">
                Pega el texto del ticket para poder detectar los productos.
              </p>
            ) : null}
            <button
              aria-describedby={!text.trim() ? 'ticket-blocked' : undefined}
              className="shopping-confirm"
              disabled={!text.trim()}
              onClick={detect}
              type="button"
            >
              Detectar productos
            </button>
          </>
        ) : (
          <>
            <p className="shopping-review-lead">
              Revisa lo detectado. Corrige el nombre, ajusta la cantidad o quita
              lo que no compraste.
            </p>
            <section
              className="shopping-list"
              aria-label="Productos detectados"
            >
              {lines.map((line, index) => (
                <div key={index} className="ticket-row">
                  <label className="sr-only" htmlFor={`ticket-name-${index}`}>
                    Producto
                  </label>
                  <input
                    id={`ticket-name-${index}`}
                    className="ticket-name"
                    value={line.name}
                    onChange={(event) =>
                      update(index, { name: event.target.value })
                    }
                    maxLength={120}
                    placeholder="Producto"
                  />
                  <label className="sr-only" htmlFor={`ticket-qty-${index}`}>
                    Cantidad
                  </label>
                  <input
                    id={`ticket-qty-${index}`}
                    className="ticket-qty"
                    value={line.quantity ?? ''}
                    onChange={(event) => {
                      const value = Number(event.target.value.replace(',', '.'))
                      update(index, {
                        quantity:
                          event.target.value && value > 0 ? value : null,
                      })
                    }}
                    inputMode="decimal"
                    placeholder="Cant."
                  />
                  <label className="sr-only" htmlFor={`ticket-unit-${index}`}>
                    Unidad
                  </label>
                  <select
                    id={`ticket-unit-${index}`}
                    className="ticket-unit"
                    value={line.unitCode ?? ''}
                    onChange={(event) =>
                      update(index, {
                        unitCode: (event.target.value ||
                          null) as TicketLine['unitCode'],
                      })
                    }
                  >
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="ticket-remove"
                    onClick={() => remove(index)}
                    type="button"
                    aria-label={`Quitar ${line.name || 'producto'}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </section>
            {/* Era un botón vestido de enlace «volver»: mismo peso visual que
                una navegación, cuando es una acción de la propia lista. */}
            <button
              className="recipe-row-add ticket-add-line"
              onClick={() =>
                setLines((current) => [...(current ?? []), EMPTY_LINE])
              }
              type="button"
            >
              + Añadir un producto
            </button>
            {status ? (
              <p className="pantry-sync-status" aria-live="polite">
                {status}
              </p>
            ) : null}
            <button
              className="shopping-confirm"
              disabled={pending || !usable}
              onClick={confirm}
              type="button"
            >
              Añadir a la compra · {usable}
            </button>
          </>
        )}
      </section>
    </AppShell>
  )
}
