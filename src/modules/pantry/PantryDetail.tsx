'use client'

import { useEffect, useState } from 'react'

import type {
  PantryApproximateState,
  PantryMutationInput,
  PantryTrackingMode,
  PantryUnitCode,
} from './types'
import type { PresentedPantryItem } from './presentation'

type Props = {
  item: PresentedPantryItem
  onClose: () => void
  onSave: (input: PantryMutationInput) => Promise<void>
}

const trackingOptions: Array<{ value: PantryTrackingMode; label: string }> = [
  { value: 'units', label: 'Unidades exactas' },
  { value: 'measure', label: 'Peso / volumen' },
  { value: 'approximate', label: 'Presencia' },
]

const approximateOptions: Array<{ value: PantryApproximateState; label: string }> = [
  { value: 'plenty', label: 'Hay' },
  { value: 'low', label: 'Queda poco' },
  { value: 'out', label: 'Se terminó' },
]

export function PantryDetail({ item, onClose, onSave }: Props) {
  const [trackingMode, setTrackingMode] = useState<PantryTrackingMode>(item.trackingMode)
  const [quantity, setQuantity] = useState(String(item.quantity ?? ''))
  const [unitCode, setUnitCode] = useState<PantryUnitCode>(item.unitCode ?? 'unit')
  const [approximateState, setApproximateState] = useState<PantryApproximateState>(item.approximateState ?? 'some')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setTrackingMode(item.trackingMode)
    setQuantity(String(item.quantity ?? ''))
    setUnitCode(item.unitCode ?? 'unit')
    setApproximateState(item.approximateState ?? 'some')
  }, [item])

  const quantityValue = quantity === '' ? null : Number(quantity)

  async function save() {
    setPending(true)
    try {
      await onSave({
        itemId: item.id,
        version: item.version,
        trackingMode,
        approximateState: trackingMode === 'approximate' ? approximateState : null,
        quantity: trackingMode === 'approximate' ? null : quantityValue,
        unitCode: trackingMode === 'measure' ? unitCode : trackingMode === 'units' ? 'unit' : null,
      })
    } finally {
      setPending(false)
    }
  }

  function adjust(delta: number) {
    const current = Number(quantity) || 0
    setQuantity(String(Math.max(0, current + delta)))
  }

  return (
    <aside className="pantry-detail" aria-label={`Detalle de ${item.name}`}>
      <button className="pantry-detail__back" type="button" onClick={onClose}>← Volver</button>
      <div className="pantry-detail__title"><h2>{item.name}</h2><span className={`pantry-detail__status pantry-detail__status--${item.status}`}>{item.status === 'out' ? 'Se terminó' : item.status === 'low' ? 'Queda poco' : 'Hay'}</span></div>
      <section className="pantry-detail__section"><h3>Tipo de seguimiento</h3><div className="pantry-detail__chips">{trackingOptions.map((option) => <button className={trackingMode === option.value ? 'is-selected' : undefined} type="button" key={option.value} onClick={() => setTrackingMode(option.value)}>{option.label}</button>)}</div></section>
      {trackingMode === 'approximate' ? <section className="pantry-detail__section"><h3>Estado actual</h3><div className="pantry-detail__chips">{approximateOptions.map((option) => <button className={approximateState === option.value ? 'is-selected' : undefined} type="button" key={option.value} onClick={() => setApproximateState(option.value)}>{option.label}</button>)}</div></section> : <section className="pantry-detail__section"><h3>Cantidad actual</h3><div className="pantry-detail__quantity"><button type="button" aria-label={`Restar a ${item.name}`} onClick={() => adjust(-1)}>−</button><input aria-label={`Cantidad de ${item.name}`} min="0" step={trackingMode === 'units' ? '1' : '0.01'} type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><button type="button" aria-label={`Sumar a ${item.name}`} onClick={() => adjust(1)}>+</button></div>{trackingMode === 'measure' ? <label className="pantry-detail__unit">Unidad<select value={unitCode} onChange={(event) => setUnitCode(event.target.value as PantryUnitCode)}><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option></select></label> : <p className="pantry-detail__help">Unidad: producto contable</p>}</section>}
      <button className="pantry-detail__save" disabled={pending || (quantityValue !== null && Number.isNaN(quantityValue))} type="button" onClick={() => void save()}>{pending ? 'Guardando…' : 'Guardar cambios'}</button>
      <p className="pantry-detail__secondary">Movimientos recientes, recetas relacionadas y corrección avanzada aparecerán aquí.</p>
    </aside>
  )
}
