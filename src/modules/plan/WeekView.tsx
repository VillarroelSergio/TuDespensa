import { timeLabel } from '@/modules/recipes/presentation'

import {
  addWeeks,
  buildWeek,
  dayLabel,
  mealLabel,
  plannedCount,
  weekRangeLabel,
} from './presentation'
import type { PlanSlot, PlannedMeal } from './types'

function Navigation({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Navegación principal">
      <a aria-current="page" href="/plan">
        Plan
      </a>
      <a href="/recetas">Recetas</a>
      <a href="/compra">Compra</a>
      <a href="/despensa">Despensa</a>
    </nav>
  )
}

function Slot({ slot }: { slot: PlanSlot }) {
  return (
    <div className="plan-slot">
      <span className="plan-slot__label">{mealLabel(slot.mealType)}</span>
      {slot.meal ? (
        <span className="plan-slot__recipe">
          <a href={`/recetas/${slot.meal.recipeId}`}>{slot.meal.title}</a>
          <span className="plan-slot__meta">
            {[
              timeLabel(slot.meal.totalMinutes),
              slot.meal.servings ? `${slot.meal.servings} raciones` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ) : (
        // ponytail: P2 (elegir receta) es Fase 5B; el hueco vacío ya muestra su
        // única acción, todavía sin destino.
        <button className="plan-slot__add" type="button" disabled>
          Añadir
        </button>
      )}
    </div>
  )
}

export function WeekView({
  startIso,
  currentWeekIso,
  meals,
}: {
  startIso: string
  currentWeekIso: string
  meals: PlannedMeal[]
}) {
  const days = buildWeek(startIso, meals)
  const planned = plannedCount(days)
  const isCurrentWeek = startIso === currentWeekIso

  return (
    <main className="shopping-page">
      <aside className="shopping-sidebar">
        <a className="pantry-brand" href="/plan">
          <span aria-hidden="true" /> MiDespensa
        </a>
        <Navigation className="shopping-sidebar__nav" />
      </aside>
      <section
        className="shopping-content plan-content"
        aria-labelledby="plan-title"
      >
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

        <p className="plan-summary" aria-live="polite">
          {isCurrentWeek ? 'Esta semana' : 'Semana seleccionada'} · {planned} de
          14 comidas planificadas
        </p>
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
              {day.slots.map((slot) => (
                <Slot key={slot.mealType} slot={slot} />
              ))}
            </li>
          ))}
        </ol>
      </section>
      <Navigation className="shopping-bottom-nav" />
    </main>
  )
}
