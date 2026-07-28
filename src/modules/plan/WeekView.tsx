import Link from 'next/link'

import { AppShell } from '@/components/ui/AppShell'
import { timeLabel } from '@/modules/recipes/presentation'

import { assignMealAction, moveMealAction, removeMealAction } from './actions'
import { PlanSlotActions } from './PlanSlotActions'
import {
  addMealLabel,
  addWeeks,
  buildWeek,
  dayLabel,
  mealLabel,
  plannedCount,
  slotLabel,
  weekRangeLabel,
} from './presentation'
import type { MealType, PlanSlot, PlannedMeal } from './types'

function chooseHref(mealDate: string, mealType: MealType) {
  return `/plan/elegir?fecha=${mealDate}&servicio=${mealType}`
}

/**
 * Menú contextual de un hueco planificado. `details` da el abrir/cerrar sin
 * JavaScript de cliente, y cada acción es un formulario independiente.
 */
function SlotMenu({ meal }: { meal: PlannedMeal }) {
  const slotId = `${meal.mealDate}-${meal.mealType}`
  const hidden = (
    <>
      <input type="hidden" name="fecha" value={meal.mealDate} />
      <input type="hidden" name="servicio" value={meal.mealType} />
      <input type="hidden" name="receta" value={meal.recipeId} />
    </>
  )

  return (
    <details className="plan-menu">
      <summary
        aria-label={`Opciones de ${slotLabel(meal.mealDate, meal.mealType)}`}
      >
        Opciones
      </summary>
      <div className="plan-menu__body">
        {meal.cookedAt ? null : (
          <a
            className="plan-menu__cook"
            href={`/plan/cocinar?fecha=${meal.mealDate}&servicio=${meal.mealType}`}
          >
            Marcar como cocinada
          </a>
        )}
        <a href={chooseHref(meal.mealDate, meal.mealType)}>Cambiar receta</a>

        <form className="plan-menu__form" action={assignMealAction}>
          {hidden}
          <label htmlFor={`raciones-${slotId}`}>Ajustar raciones</label>
          <input
            id={`raciones-${slotId}`}
            name="raciones"
            type="number"
            min={1}
            max={99}
            step={1}
            defaultValue={meal.servings ?? ''}
          />
          <button type="submit">Guardar</button>
        </form>

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

        {/* Eliminar pide confirmación: el segundo `details` es el paso extra. */}
        <details className="plan-menu__danger">
          <summary>Eliminar</summary>
          <form action={removeMealAction}>
            {hidden}
            <input type="hidden" name="raciones" value={meal.servings ?? ''} />
            <p>Se quitará «{meal.title}» de este hueco.</p>
            <button type="submit">Sí, eliminar</button>
          </form>
        </details>
      </div>
    </details>
  )
}

function Slot({ slot }: { slot: PlanSlot }) {
  return (
    <div className="plan-slot">
      <span className="plan-slot__label">{mealLabel(slot.mealType)}</span>
      {slot.meal ? (
        <div className="plan-slot__recipe">
          <Link href={`/recetas/${slot.meal.recipeId}`}>{slot.meal.title}</Link>
          <span className="plan-slot__meta">
            {[
              timeLabel(slot.meal.totalMinutes),
              slot.meal.servings ? `${slot.meal.servings} raciones` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {slot.meal.cookedAt ? (
            <span className="plan-slot__cooked">✓ Cocinada</span>
          ) : null}
          <PlanSlotActions meal={slot.meal} />
        </div>
      ) : (
        <a
          className="plan-slot__add"
          href={chooseHref(slot.mealDate, slot.mealType)}
        >
          {addMealLabel(slot.mealDate, slot.mealType)}
        </a>
      )}
    </div>
  )
}

/** Rehace la asignación que un borrado acaba de deshacer. */
function UndoBanner({
  undo,
}: {
  undo: {
    mealDate: string
    mealType: MealType
    recipeId: string
    servings: string
  }
}) {
  return (
    <form className="plan-undo" action={assignMealAction} role="status">
      <input type="hidden" name="fecha" value={undo.mealDate} />
      <input type="hidden" name="servicio" value={undo.mealType} />
      <input type="hidden" name="receta" value={undo.recipeId} />
      <input type="hidden" name="raciones" value={undo.servings} />
      <span>Hemos quitado {slotLabel(undo.mealDate, undo.mealType)}.</span>
      <button type="submit">Deshacer</button>
    </form>
  )
}

export function WeekView({
  startIso,
  currentWeekIso,
  meals,
  undo,
  notice,
  cookedNotice,
}: {
  startIso: string
  currentWeekIso: string
  meals: PlannedMeal[]
  notice?: string | null
  cookedNotice?: string | null
  undo?: {
    mealDate: string
    mealType: MealType
    recipeId: string
    servings: string
  } | null
}) {
  const days = buildWeek(startIso, meals)
  const planned = plannedCount(days)
  const isCurrentWeek = startIso === currentWeekIso

  return (
    <AppShell current="plan" contentClassName="plan-content">
      <div aria-labelledby="plan-title">
        <header className="shopping-header plan-header">
          <h1 id="plan-title">Plan</h1>
          <div className="plan-weeknav">
            <a
              className="plan-weeknav__step"
              href={`/plan?semana=${addWeeks(startIso, -1)}`}
              aria-label="Semana anterior"
              rel="prev"
            >
              ←
            </a>
            <span className="plan-weeknav__range">
              {weekRangeLabel(startIso)}
            </span>
            <a
              className="plan-weeknav__step"
              href={`/plan?semana=${addWeeks(startIso, 1)}`}
              aria-label="Semana siguiente"
              rel="next"
            >
              →
            </a>
          </div>
        </header>

        {undo ? <UndoBanner undo={undo} /> : null}
        {/* Confirmación discreta de la consolidación en Compra: informa sin
            interrumpir ni exigir una respuesta. */}
        {notice ? (
          <p className="plan-notice" role="status">
            {notice} · <a href="/compra">Ver Compra</a>
          </p>
        ) : null}
        {cookedNotice ? (
          <p className="plan-notice" role="status">
            {cookedNotice} · <a href="/despensa">Ver Despensa</a>
          </p>
        ) : null}

        <section className="plan-overview" aria-live="polite">
          <div>
            <p className="plan-overview__eyebrow">
              {isCurrentWeek ? 'Esta semana' : 'Semana seleccionada'}
            </p>
            <p className="plan-summary">
              {planned === 14
                ? 'El menú está listo para la semana.'
                : 'Elige solo lo que quieras resolver ahora.'}
            </p>
          </div>
          <div className="plan-overview__count">
            <strong>{planned}<span> de 14</span></strong>
            <span>comidas planificadas</span>
          </div>
        </section>
        {!isCurrentWeek ? (
          <a className="plan-today" href="/plan">
            Volver a esta semana
          </a>
        ) : null}
        {/* El texto guía se muestra una vez, no por hueco vacío (UX Plan P1). */}
        {planned === 0 ? (
          <p className="plan-hint">
            Empieza por una comida que quieras resolver.
          </p>
        ) : null}

        <ol className="plan-week" aria-label="Días de la semana">
          {days.map((day) => (
            <li className="plan-day" key={day.mealDate}>
              <h2 className="plan-day__title">{dayLabel(day.mealDate)}</h2>
              <div className="plan-day__slots">
                {day.slots.map((slot) => (
                  <Slot key={slot.mealType} slot={slot} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </AppShell>
  )
}
