'use client'

import { useState } from 'react'

import { PANTRY_ZONE_META, PANTRY_ZONE_ORDER } from './presentation'
import type { PantryZone } from './types'

type EntryInput = {
  zone: PantryZone
  foodName: string
  trackingMode: 'approximate'
  approximateState: 'some'
  quantity: null
  unitCode: null
}

type Props = {
  onClose: () => void
  onSave: (input: EntryInput) => Promise<void>
}

const zoneOptions = PANTRY_ZONE_ORDER.map((value) => ({
  value,
  label: PANTRY_ZONE_META[value].label,
}))

/** Añadir ya significa que el producto está disponible en casa. */
export function PantryEntryForm({ onClose, onSave }: Props) {
  const [zone, setZone] = useState<PantryZone>('pantry')
  const [foodName, setFoodName] = useState('')
  const [pending, setPending] = useState(false)

  async function save() {
    const name = foodName.trim()
    if (!name) return

    setPending(true)
    try {
      await onSave({
        zone,
        foodName: name,
        trackingMode: 'approximate',
        approximateState: 'some',
        quantity: null,
        unitCode: null,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <aside className="pantry-detail" aria-labelledby="pantry-entry-title">
      <button className="pantry-detail__back" type="button" onClick={onClose}>
        ← Volver
      </button>
      <div className="pantry-detail__title">
        <h2 id="pantry-entry-title">Añadir producto</h2>
      </div>
      <label className="pantry-detail__field" htmlFor="pantry-entry-name">
        Producto
        <input
          autoFocus
          disabled={pending}
          id="pantry-entry-name"
          maxLength={120}
          onChange={(event) => setFoodName(event.target.value)}
          placeholder="Por ejemplo, yogures"
          type="text"
          value={foodName}
        />
      </label>
      <section className="pantry-detail__section">
        <h3>¿Dónde lo guardas?</h3>
        <div className="pantry-detail__chips">
          {zoneOptions.map((option) => (
            <button
              className={zone === option.value ? 'is-selected' : undefined}
              disabled={pending}
              key={option.value}
              onClick={() => setZone(option.value)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`pantry-zone-icon pantry-zone-icon--${option.value}`}
              />
              {option.label}
            </button>
          ))}
        </div>
      </section>
      <button
        className="pantry-detail__save"
        disabled={pending || !foodName.trim()}
        onClick={() => void save()}
        type="button"
      >
        {pending ? 'Añadiendo…' : 'Añadir a despensa'}
      </button>
    </aside>
  )
}
