'use client'

import { useState } from 'react'

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

const trackingOptions: Array<{ value: PantryTrackingMode; label: string }> = [
  { value: 'units', label: 'Unidades exactas' },
  { value: 'measure', label: 'Peso / volumen' },
  { value: 'approximate', label: 'Presencia' },
]

const approximateOptions: Array<{ value: PantryApproximateState; label: string }> = [
  { value: 'plenty', label: 'Hay' },
  { value: 'some', label: 'Hay algo' },
  { value: 'low', label: 'Queda poco' },
]

export function PantryEntryForm({ onClose, onSave }: Props) {
  const [foodName, setFoodName] = useState('')
  const [trackingMode, setTrackingMode] = useState<PantryTrackingMode>('units')
  const [quantity, setQuantity] = useState('1')
  const [unitCode, setUnitCode] = useState<PantryUnitCode>('g')
  const [approximateState, setApproximateState] =
    useState<PantryApproximateState>('some')
  const [pending, setPending] = useState(false)

  const quantityValue = Number(quantity)
  const hasValidQuantity = Number.isFinite(quantityValue) && quantityValue > 0

  async function save() {
    if (!foodName.trim() || (trackingMode !== 'approximate' && !hasValidQuantity)) {
      return
    }

    setPending(true)
    try {
      await onSave({
        zone: 'pantry',
        foodName: foodName.trim(),
        trackingMode,
        approximateState:
          trackingMode === 'approximate' ? approximateState : null,
        quantity: trackingMode === 'approximate' ? null : quantityValue,
        unitCode:
          trackingMode === 'measure'
            ? unitCode
            : trackingMode === 'units'
              ? 'unit'
              : null,
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
          id="pantry-entry-name"
          maxLength={120}
          onChange={(event) => setFoodName(event.target.value)}
          placeholder="Por ejemplo, yogures"
          type="text"
          value={foodName}
        />
      </label>
      <section className="pantry-detail__section">
        <h3>Tipo de seguimiento</h3>
        <div className="pantry-detail__chips">
          {trackingOptions.map((option) => (
            <button
              className={trackingMode === option.value ? 'is-selected' : undefined}
              key={option.value}
              onClick={() => setTrackingMode(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
      {trackingMode === 'approximate' ? (
        <section className="pantry-detail__section">
          <h3>Estado actual</h3>
          <div className="pantry-detail__chips">
            {approximateOptions.map((option) => (
              <button
                className={approximateState === option.value ? 'is-selected' : undefined}
                key={option.value}
                onClick={() => setApproximateState(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="pantry-detail__section">
          <h3>Cantidad inicial</h3>
          <input
            aria-label="Cantidad inicial"
            className="pantry-detail__number-input"
            min="0.01"
            onChange={(event) => setQuantity(event.target.value)}
            step={trackingMode === 'units' ? '1' : '0.01'}
            type="number"
            value={quantity}
          />
          {trackingMode === 'measure' ? (
            <label className="pantry-detail__unit">
              Unidad
              <select
                onChange={(event) => setUnitCode(event.target.value as PantryUnitCode)}
                value={unitCode}
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="l">l</option>
              </select>
            </label>
          ) : (
            <p className="pantry-detail__help">Unidad: producto contable</p>
          )}
        </section>
      )}
      <button
        className="pantry-detail__save"
        disabled={
          pending ||
          !foodName.trim() ||
          (trackingMode !== 'approximate' && !hasValidQuantity)
        }
        onClick={() => void save()}
        type="button"
      >
        {pending ? 'Añadiendo…' : 'Añadir a despensa'}
      </button>
    </aside>
  )
}
