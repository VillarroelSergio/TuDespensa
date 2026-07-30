'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

import { moveMealAction, removeMealAction } from './actions'
import { slotLabel } from './presentation'
import type { PlannedMeal } from './types'

/**
 * Menú contextual de un hueco planificado. `details` da el abrir/cerrar sin
 * estado propio y cada acción es un formulario independiente.
 *
 * El navegador no cierra un `<details>` con Escape ni al pulsar fuera, y en
 * móvil el cuerpo se ancla al fondo de la pantalla: el disparador «Opciones»
 * quedaba tapado por la propia hoja y no había forma evidente de salir. Por eso
 * este componente es de cliente: añade Escape, pulsación fuera, devolución del
 * foco al disparador y un botón «Cerrar» visible.
 */
export function SlotMenu({ meal }: { meal: PlannedMeal }) {
  const slotId = `${meal.mealDate}-${meal.mealType}`
  const root = useRef<HTMLDetailsElement>(null)
  const chooseHref = `/plan/elegir?fecha=${meal.mealDate}&servicio=${meal.mealType}`

  function close(returnFocus: boolean) {
    const element = root.current
    if (!element?.open) return
    element.open = false
    if (returnFocus) element.querySelector('summary')?.focus()
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close(true)
    }
    function onPointerDown(event: Event) {
      if (!root.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  const hidden = (
    <>
      <input type="hidden" name="fecha" value={meal.mealDate} />
      <input type="hidden" name="servicio" value={meal.mealType} />
      <input type="hidden" name="receta" value={meal.recipeId} />
    </>
  )

  return (
    <details className="plan-menu" ref={root}>
      <summary
        aria-label={`Opciones de ${slotLabel(meal.mealDate, meal.mealType)}`}
      >
        Opciones
      </summary>
      <div className="plan-menu__body">
        {meal.cookedAt ? null : (
          <Link
            className="plan-menu__cook"
            href={`/plan/cocinar?fecha=${meal.mealDate}&servicio=${meal.mealType}`}
          >
            Marcar como cocinada
          </Link>
        )}
        <Link href={chooseHref}>Cambiar receta</Link>

        <form className="plan-menu__form" action={moveMealAction}>
          <input type="hidden" name="origen-fecha" value={meal.mealDate} />
          <input type="hidden" name="origen-servicio" value={meal.mealType} />
          <input type="hidden" name="receta" value={meal.recipeId} />
          <input type="hidden" name="raciones" value={meal.servings ?? ''} />
          <label htmlFor={`mover-${slotId}`}>Mover a</label>
          <input
            id={`mover-${slotId}`}
            name="fecha"
            type="date"
            defaultValue={meal.mealDate}
          />
          <select
            name="servicio"
            defaultValue={meal.mealType}
            aria-label="Servicio de destino"
          >
            <option value="lunch">Comida</option>
            <option value="dinner">Cena</option>
          </select>
          <button type="submit">Mover</button>
        </form>

        {/* Sin confirmación extra: el banner de Deshacer ya cubre el error. */}
        <form action={removeMealAction}>
          {hidden}
          <input type="hidden" name="raciones" value={meal.servings ?? ''} />
          <button className="plan-menu__remove" type="submit">
            Quitar de este hueco
          </button>
        </form>

        <button
          className="plan-menu__close"
          onClick={() => close(true)}
          type="button"
        >
          Cerrar
        </button>
      </div>
    </details>
  )
}
