'use client'

import { useState } from 'react'

import { PANTRY_ZONE_META, PANTRY_ZONE_ORDER } from './presentation'
import type { PresentedPantryItem } from './presentation'
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
  item?: PresentedPantryItem
  onClose: () => void
  onSave: (input: EntryInput) => Promise<void>
}

const zoneOptions = PANTRY_ZONE_ORDER.map((value) => ({
  value,
  label: PANTRY_ZONE_META[value].label,
}))

const unitLabels: Record<PantryUnitCode, string> = {
  unit: 'unidades',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
}

/**
 * Al dar de alta un producto, la despensa se mide únicamente en unidades.
 * Al editar uno existente, se conserva su modo de seguimiento (unidades,
 * medida o aproximado) — solo nombre, zona y cantidad son editables aquí.
 */
export function PantryEntryForm({ item, onClose, onSave }: Props) {
  const [zone, setZone] = useState<PantryZone>(item?.zone ?? 'pantry')
  const [foodName, setFoodName] = useState(item?.name ?? '')
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [pending, setPending] = useState(false)
  const trackingMode = item?.trackingMode ?? 'units'
  const hasQuantity = trackingMode !== 'approximate'
  const exactQuantity = Number(quantity)
  const hasValidQuantity =
    !hasQuantity || (Number.isFinite(exactQuantity) && exactQuantity > 0)

  async function save() {
    const name = foodName.trim()
    if (!name || !hasValidQuantity) return

    setPending(true)
    try {
      await onSave({
        zone,
        foodName: name,
        trackingMode,
        approximateState: item?.approximateState ?? null,
        quantity: hasQuantity ? exactQuantity : null,
        unitCode: hasQuantity ? (item?.unitCode ?? 'unit') : null,
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
        <h2 id="pantry-entry-title">
          {item ? 'Editar producto' : 'Añadir producto'}
        </h2>
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
        <h3 id="pantry-entry-zone">¿Dónde lo guardas?</h3>
        {/* Los chips son un grupo de opciones excluyentes: sin role="group" el
            aria-label se ignoraba, y sin aria-pressed la zona elegida solo se
            distinguía por el color de fondo. */}
        <div
          className="pantry-detail__chips"
          role="group"
          aria-labelledby="pantry-entry-zone"
        >
          {zoneOptions.map((option) => (
            <button
              aria-pressed={zone === option.value}
              className={zone === option.value ? 'is-selected' : undefined}
              disabled={pending}
              key={option.value}
              onClick={() => setZone(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
      {hasQuantity ? (
        <section className="pantry-detail__section">
          <h3>Unidades</h3>
          <div className="pantry-detail__exact-fields">
            <label
              className="pantry-detail__field"
              htmlFor="pantry-entry-quantity"
            >
              Cantidad
              <input
                disabled={pending}
                id="pantry-entry-quantity"
                inputMode="decimal"
                min="0.001"
                onChange={(event) => setQuantity(event.target.value)}
                step="any"
                type="number"
                value={quantity}
              />
            </label>
            <p className="pantry-detail__exact-unit">
              {unitLabels[item?.unitCode ?? 'unit']}
            </p>
          </div>
        </section>
      ) : null}
      {/* Un botón apagado sin explicación deja a la persona sin saber qué le
          falta; el texto se anuncia al enfocar el botón. */}
      {!pending && (!foodName.trim() || !hasValidQuantity) ? (
        <p className="pantry-detail__help" id="pantry-entry-blocked">
          {!foodName.trim()
            ? 'Escribe el nombre del producto para poder guardarlo.'
            : 'Indica una cantidad mayor que cero.'}
        </p>
      ) : null}
      <button
        aria-describedby={
          !pending && (!foodName.trim() || !hasValidQuantity)
            ? 'pantry-entry-blocked'
            : undefined
        }
        className="pantry-detail__save"
        disabled={pending || !foodName.trim() || !hasValidQuantity}
        onClick={() => void save()}
        type="button"
      >
        {pending
          ? item
            ? 'Guardando…'
            : 'Añadiendo…'
          : item
            ? 'Guardar cambios'
            : 'Añadir a despensa'}
      </button>
    </aside>
  )
}
