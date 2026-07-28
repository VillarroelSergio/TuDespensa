'use client'

import { useId, useRef } from 'react'
import type { ReactNode } from 'react'

import { assignMealAction } from './actions'
import { slotLabel } from './presentation'
import type { MealType } from './types'

type ChooseRecipeActionProps = {
  mealDate: string
  mealType: MealType
  recipeId: string
  title: string
  servings?: number | null
  className: string
  children: ReactNode
}

/** Confirms the target slot and servings before changing Plan and Shopping. */
export function ChooseRecipeAction({
  mealDate,
  mealType,
  recipeId,
  title,
  servings,
  className,
  children,
}: ChooseRecipeActionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const descriptionId = useId()
  const servingsId = useId()
  const slot = slotLabel(mealDate, mealType)

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={`Elegir ${title} para ${slot}`}
        className={className}
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        {children}
      </button>

      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={headingId}
        className="choose-confirm-dialog"
        ref={dialogRef}
      >
        <form action={assignMealAction} className="choose-confirm-dialog__form">
          <header className="choose-confirm-dialog__header">
            <div>
              <p>Vas a planificar</p>
              <h2 id={headingId}>{title}</h2>
            </div>
            <button
              aria-label="Cerrar"
              className="choose-confirm-dialog__close"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              {'\u00d7'}
            </button>
          </header>
          <p className="choose-confirm-dialog__slot" id={descriptionId}>
            {slot}
          </p>

          <input name="fecha" type="hidden" value={mealDate} />
          <input name="servicio" type="hidden" value={mealType} />
          <input name="receta" type="hidden" value={recipeId} />
          <input name="consolidar" type="hidden" value="1" />

          <label className="choose-confirm-dialog__servings" htmlFor={servingsId}>
            Raciones
            <span>{'Las cantidades de Compra se ajustan a esta elecci\u00f3n.'}</span>
          </label>
          <input
            defaultValue={servings ?? ''}
            id={servingsId}
            inputMode="numeric"
            max={99}
            min={1}
            name="raciones"
            placeholder="No especificadas"
            step={1}
            type="number"
          />

          <div className="choose-confirm-dialog__actions">
            <button
              className="choose-confirm-dialog__cancel"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              Cancelar
            </button>
            <button className="choose-confirm-dialog__submit" type="submit">
              {'A\u00f1adir al plan'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
