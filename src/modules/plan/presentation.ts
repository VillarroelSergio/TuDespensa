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
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number)
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

/** «martes, comida»: identifica el hueco al abrir P2 o el menú contextual. */
export function slotLabel(iso: string, mealType: MealType) {
  return `${DAY_NAMES[toDate(iso).getUTCDay()]}, ${MEAL_LABELS[mealType].toLowerCase()}`
}

/** Texto de acción inequívoco para un hueco vacío del plan semanal. */
export function addMealLabel(iso: string, mealType: MealType) {
  return `Añadir ${MEAL_LABELS[mealType].toLowerCase()} del ${DAY_NAMES[toDate(iso).getUTCDay()]}`
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

/**
 * Confirmación breve de la consolidación en Compra (`?compra=`). Un valor
 * negativo significa que la comida se planificó pero la lista no se pudo tocar.
 */
export function shoppingNotice(raw: string | undefined): string | null {
  const added = Number(raw)
  if (!raw || !Number.isInteger(added)) return null
  if (added < 0) {
    return 'Hemos planificado la comida, pero no hemos podido actualizar Compra.'
  }
  if (added === 0) return null
  return added === 1
    ? 'Hemos añadido 1 producto a Compra'
    : `Hemos añadido ${added} productos a Compra`
}

/**
 * Confirmación breve de cocinar (`?cocinada=`). El valor es cuántos productos se
 * descontaron; cero es válido (cocinada sin nada que descontar).
 */
export function cookNotice(raw: string | undefined): string | null {
  const consumed = Number(raw)
  if (raw === undefined || !Number.isInteger(consumed) || consumed < 0) return null
  if (consumed === 0) return 'Hemos marcado la comida como cocinada.'
  return consumed === 1
    ? 'Cocinada · hemos descontado 1 producto de tu despensa.'
    : `Cocinada · hemos descontado ${consumed} productos de tu despensa.`
}

/**
 * Lee el parámetro `deshacer` que deja un borrado: `fecha:servicio:receta:raciones`.
 * Devuelve `null` si no es utilizable, para no ofrecer un deshacer que fallaría.
 */
export function parseUndo(raw: string | undefined) {
  const [mealDate, mealType, recipeId, servings] = (raw ?? '').split(':')
  if (!mealDate || !/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) return null
  if (mealType !== 'lunch' && mealType !== 'dinner') return null
  if (!recipeId) return null
  return {
    mealDate,
    mealType: mealType as MealType,
    recipeId,
    servings: servings ?? '',
  }
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
