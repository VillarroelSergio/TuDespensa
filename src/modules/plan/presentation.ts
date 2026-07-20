import type { MealType, PlanDay, PlannedMeal } from './types'

export const MEAL_TYPES: MealType[] = ['lunch', 'dinner']

const MEAL_LABELS: Record<MealType, string> = {
  lunch: 'Comida',
  dinner: 'Cena',
}

const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
]

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export function mealLabel(mealType: MealType) {
  return MEAL_LABELS[mealType]
}

// ponytail: fechas en UTC a partir de 'YYYY-MM-DD'. El plan es una fecha local
// sin hora; construir con Date local desplazaría el día según la zona horaria.
function toDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number) {
  const date = toDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toIso(date)
}

/** Lunes de la semana que contiene `iso` (semana ISO, como date_trunc('week')). */
export function weekStart(iso: string) {
  const date = toDate(iso)
  const weekday = (date.getUTCDay() + 6) % 7
  return addDays(iso, -weekday)
}

export function addWeeks(startIso: string, weeks: number) {
  return addDays(startIso, weeks * 7)
}

export function weekDates(startIso: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(startIso, index))
}

export function dayLabel(iso: string) {
  const date = toDate(iso)
  return `${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()}`
}

/** «20 – 26 de julio» o «29 de junio – 5 de julio» si cruza de mes. */
export function weekRangeLabel(startIso: string) {
  const start = toDate(startIso)
  const end = toDate(addDays(startIso, 6))
  const endLabel = `${end.getUTCDate()} de ${MONTH_NAMES[end.getUTCMonth()]}`
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${start.getUTCDate()} – ${endLabel}`
    : `${start.getUTCDate()} de ${MONTH_NAMES[start.getUTCMonth()]} – ${endLabel}`
}

/** Los 7 días con sus dos huecos, en orden temporal y siempre completos. */
export function buildWeek(startIso: string, meals: PlannedMeal[]): PlanDay[] {
  const bySlot = new Map(
    meals.map((meal) => [`${meal.mealDate}:${meal.mealType}`, meal]),
  )
  return weekDates(startIso).map((mealDate) => ({
    mealDate,
    slots: MEAL_TYPES.map((mealType) => ({
      mealDate,
      mealType,
      meal: bySlot.get(`${mealDate}:${mealType}`) ?? null,
    })),
  }))
}

export function plannedCount(days: PlanDay[]) {
  return days.reduce(
    (total, day) => total + day.slots.filter((slot) => slot.meal).length,
    0,
  )
}
