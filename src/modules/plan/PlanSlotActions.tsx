'use client'

import Link from 'next/link'
import { useRef } from 'react'

import { assignMealAction, moveMealAction, removeMealAction } from './actions'
import { slotLabel } from './presentation'
import type { PlannedMeal } from './types'

function chooseHref(meal: PlannedMeal) {
  return `/plan/elegir?fecha=${meal.mealDate}&servicio=${meal.mealType}`
}

export function PlanSlotActions({ meal }: { meal: PlannedMeal }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const slotId = `${meal.mealDate}-${meal.mealType}`
  const headingId = `acciones-${slotId}`
  const hidden = (
    <>
      <input type="hidden" name="fecha" value={meal.mealDate} />
      <input type="hidden" name="servicio" value={meal.mealType} />
      <input type="hidden" name="receta" value={meal.recipeId} />
    </>
  )

  return (
    <>
      <button className="plan-action-trigger" type="button" aria-haspopup="dialog" aria-label={`Opciones de ${slotLabel(meal.mealDate, meal.mealType)}`} onClick={() => dialogRef.current?.showModal()}>
        Opciones
      </button>
      <dialog ref={dialogRef} className="plan-actions-dialog" aria-labelledby={headingId}>
        <header className="plan-actions-dialog__header">
          <div><p>Plan semanal</p><h2 id={headingId}>{meal.title}</h2></div>
          <button className="plan-actions-dialog__close" type="button" onClick={() => dialogRef.current?.close()} aria-label="Cerrar opciones">×</button>
        </header>
        <div className="plan-actions-dialog__body">
          {meal.cookedAt ? null : <a className="plan-actions-dialog__primary" href={`/plan/cocinar?fecha=${meal.mealDate}&servicio=${meal.mealType}`}>Marcar como cocinada</a>}
          <Link href={chooseHref(meal)}>Cambiar receta</Link>
          <form className="plan-actions-dialog__form" action={assignMealAction}>
            {hidden}<label htmlFor={`raciones-${slotId}`}>Raciones</label>
            <div><input id={`raciones-${slotId}`} name="raciones" type="number" min={1} max={99} step={1} defaultValue={meal.servings ?? ''} /><button type="submit">Guardar</button></div>
          </form>
          <form className="plan-actions-dialog__form" action={moveMealAction}>
            <input type="hidden" name="origen-fecha" value={meal.mealDate} /><input type="hidden" name="origen-servicio" value={meal.mealType} /><input type="hidden" name="receta" value={meal.recipeId} /><input type="hidden" name="raciones" value={meal.servings ?? ''} />
            <label htmlFor={`mover-${slotId}`}>Mover a</label>
            <div className="plan-actions-dialog__move-fields"><input id={`mover-${slotId}`} name="fecha" type="date" defaultValue={meal.mealDate} /><select name="servicio" defaultValue={meal.mealType} aria-label="Servicio de destino"><option value="lunch">Comida</option><option value="dinner">Cena</option></select><button type="submit">Mover</button></div>
          </form>
          <form className="plan-actions-dialog__remove" action={removeMealAction}>{hidden}<input type="hidden" name="raciones" value={meal.servings ?? ''} /><p>Quitar esta receta del plan.</p><button type="submit">Eliminar del plan</button></form>
        </div>
      </dialog>
    </>
  )
}
