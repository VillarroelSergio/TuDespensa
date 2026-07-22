'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { BrandLockup } from '@/components/ui/BrandLockup'

import { importTicketItems } from './actions'
import { readTicketImage } from './ocr'
import { Navigation } from './ShoppingList'
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
// Compra. No hay OCR ni imagen: la persona pega el texto y confirma lo detectado
// antes de que nada toque la lista.
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

  // Rebanada 2: leer una foto en el propio dispositivo. La imagen no se sube ni se
  // guarda; se convierte en texto y se descarta. El texto pasa por el mismo repaso.
  async function handlePhoto(file: File) {
    if (pending) return
    setPending(true)
    setStatus('Leyendo la foto en tu dispositivo…')
    try {
      const detected = parseTicketLines(await readTicketImage(file, (ratio) =>
        setStatus(`Leyendo la foto en tu dispositivo… ${Math.round(ratio * 100)}%`),
      ))
      setLines(detected.length ? detected : [EMPTY_LINE])
      setStatus('')
    } catch {
      setStatus('No hemos podido leer la foto. Prueba con más luz o pega el texto a mano.')
    } finally {
      setPending(false)
    }
  }

  function update(index: number, patch: Partial<TicketLine>) {
    setLines((current) =>
      (current ?? []).map((line, i) => (i === index ? { ...line, ...patch } : line)),
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

  const usable = (lines ?? []).filter((line) => line.name.trim().length > 0).length

  return (
    <main className="shopping-page">
      <aside className="shopping-sidebar">
        <BrandLockup className="pantry-brand" />
        <Navigation className="shopping-sidebar__nav" />
      </aside>
      <section className="shopping-content" aria-labelledby="ticket-title">
        <a className="shopping-back" href="/compra">
          ← Volver a la lista
        </a>
        <header className="shopping-header">
          <h1 id="ticket-title">Importar de un ticket</h1>
        </header>

        {lines === null ? (
          <>
            <p className="shopping-review-lead">
              Haz una foto del ticket o copia sus líneas, una por producto. Podrás revisarlas y corregirlas antes de añadirlas. La foto se lee en tu móvil y no se guarda.
            </p>
            <label className="shopping-back ticket-photo">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={pending}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handlePhoto(file)
                  event.target.value = '' // permite reintentar la misma foto
                }}
              />
              Hacer una foto del ticket
            </label>
            {status ? (
              <p className="pantry-sync-status" aria-live="polite">
                {status}
              </p>
            ) : null}
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
            <button
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
              Revisa lo detectado. Corrige el nombre, ajusta la cantidad o quita lo que no compraste.
            </p>
            <section className="shopping-list" aria-label="Productos detectados">
              {lines.map((line, index) => (
                <div key={index} className="ticket-row">
                  <label className="sr-only" htmlFor={`ticket-name-${index}`}>
                    Producto
                  </label>
                  <input
                    id={`ticket-name-${index}`}
                    className="ticket-name"
                    value={line.name}
                    onChange={(event) => update(index, { name: event.target.value })}
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
                        quantity: event.target.value && value > 0 ? value : null,
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
                        unitCode: (event.target.value || null) as TicketLine['unitCode'],
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
            <button
              className="shopping-back ticket-add-line"
              onClick={() => setLines((current) => [...(current ?? []), EMPTY_LINE])}
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
      <Navigation className="shopping-bottom-nav" />
    </main>
  )
}
