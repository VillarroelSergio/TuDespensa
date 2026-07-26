'use client'

import { useState } from 'react'

import { PANTRY_ZONE_META, PANTRY_ZONE_ORDER } from './presentation'
import type {
  PantryApproximateState,
  PantryTrackingMode,
  PantryUnitCode,
  PantryZone,
} from './types'

type EntryInput = {
  zone: PantryZone
  foodName: string
  trackingMode: PantryTrackingMode
  approximateState: PantryApproximateState | null
  quantity: number | null
  unitCode: PantryUnitCode | null
}

type Props = {
  onClose: () => void
  onSave: (input: EntryInput) => Promise<void>
}

const zoneOptions = PANTRY_ZONE_ORDER.map((value) => ({
  value,
  label: PANTRY_ZONE_META[value].label,
}))

const measureUnits: { value: Extract<PantryUnitCode, 'g' | 'kg' | 'ml' | 'l'>; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'l' },
]

/** Añadir ya significa que el producto está disponible en casa. */
export function PantryEntryForm({ onClose, onSave }: Props) {
  const [zone, setZone] = useState<PantryZone>('pantry')
  const [foodName, setFoodName] = useState('')
  const [trackingMode, setTrackingMode] =
    useState<PantryTrackingMode>('approximate')
  const [quantity, setQuantity] = useState('1')
  const [unitCode, setUnitCode] = useState<PantryUnitCode>('unit')
  const [pending, setPending] = useState(false)
  const exactQuantity = Number(quantity)
  const hasValidExactQuantity =
    Number.isFinite(exactQuantity) && exactQuantity > 0

  function selectTrackingMode(mode: PantryTrackingMode) {
    setTrackingMode(mode)
    if (mode === 'units') setUnitCode('unit')
    if (mode === 'measure' && unitCode === 'unit') setUnitCode('g')
  }

  async function save() {
    const name = foodName.trim()
    if (!name || (trackingMode !== 'approximate' && !hasValidExactQuantity))
      return

    setPending(true)
    try {
      await onSave({
        zone,
        foodName: name,
        trackingMode,
        approximateState: trackingMode === 'approximate' ? 'some' : null,
        quantity: trackingMode === 'approximate' ? null : exactQuantity,
        unitCode: trackingMode === 'approximate' ? null : unitCode,
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
      <section className="pantry-detail__section">
        <h3>¿Cómo quieres llevarlo?</h3>
        <div className="pantry-detail__chips" role="group" aria-label="Forma de seguimiento">
          <button
            className={trackingMode === 'approximate' ? 'is-selected' : undefined}
            disabled={pending}
            onClick={() => selectTrackingMode('approximate')}
            type="button"
          >
            Solo presencia
          </button>
          <button
            className={trackingMode === 'units' ? 'is-selected' : undefined}
            disabled={pending}
            onClick={() => selectTrackingMode('units')}
            type="button"
          >
            Unidades
          </button>
          <button
            className={trackingMode === 'measure' ? 'is-selected' : undefined}
            disabled={pending}
            onClick={() => selectTrackingMode('measure')}
            type="button"
          >
            Peso o volumen
          </button>
        </div>
        {trackingMode !== 'approximate' ? (
          <div className="pantry-detail__exact-fields">
            <label className="pantry-detail__field" htmlFor="pantry-entry-quantity">
              Cantidad
              <input
                id="pantry-entry-quantity"
                inputMode="decimal"
                min="0.001"
                onChange={(event) => setQuantity(event.target.value)}
                step="any"
                type="number"
                value={quantity}
              />
            </label>
            {trackingMode === 'measure' ? (
              <label className="pantry-detail__field" htmlFor="pantry-entry-unit">
                Unidad
                <select
                  id="pantry-entry-unit"
                  onChange={(event) => setUnitCode(event.target.value as PantryUnitCode)}
                  value={unitCode}
                >
                  {measureUnits.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="pantry-detail__exact-unit">unidades</p>
            )}
          </div>
        ) : (
          <p className="pantry-detail__hint">Solo indicaremos que está disponible.</p>
        )}
      </section>
      <button
        className="pantry-detail__save"
        disabled={
          pending ||
          !foodName.trim() ||
          (trackingMode !== 'approximate' && !hasValidExactQuantity)
        }
        onClick={() => void save()}
        type="button"
      >
        {pending ? 'Añadiendo…' : 'Añadir a despensa'}
      </button>
    </aside>
  )
}
