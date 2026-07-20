import type { RecipeDishType } from '@/modules/recipes/types'

/**
 * Pesos versionados del ranking. Subir la versión al cambiar cualquier peso:
 * es lo que permite explicar por qué una sugerencia de ayer no sale hoy.
 */
export const SUGGESTION_WEIGHTS_VERSION = 1

export const SUGGESTION_WEIGHTS = {
  /** Por fracción de ingredientes ya disponibles en la despensa. */
  availability: 40,
  /** Usa algún producto marcado como prioritario (bajo o a consumir pronto). */
  priorityFood: 25,
  /** Favorita de la persona que planifica. */
  favorite: 12,
  /** Por punto de puntuación por encima de 3. */
  ratingPoint: 3,
  /** Tipo de plato que no se repite en la semana mostrada. */
  variety: 10,
  /** Se resuelve en 30 minutos o menos. */
  quick: 8,
  /** Clasificada como mediterránea. */
  mediterranean: 6,
  /** Ya planificada esta semana: no se prohíbe, se hunde. */
  repeated: -60,
} as const

/** Se considera rápida por debajo de este umbral (minutos). */
const QUICK_MINUTES = 30
/** Número exacto de sugerencias que pide la especificación de Plan P2. */
const SUGGESTION_COUNT = 3

export type SuggestionCandidate = {
  id: string
  title: string
  totalMinutes: number | null
  dishType: RecipeDishType | null
  isFavorite: boolean
  rating: number | null
  categories: string[]
  ingredients: string[]
}

export type SuggestionPantryItem = {
  name: string
  /** Producto prioritario: bajo, marcado por el hogar o a consumir pronto. */
  priority: boolean
}

export type SuggestionInput = {
  candidates: SuggestionCandidate[]
  pantry: SuggestionPantryItem[]
  /** Recetas ya planificadas en la semana mostrada. */
  plannedRecipeIds: string[]
  /** Tipos de plato ya presentes en la semana mostrada. */
  plannedDishTypes: (RecipeDishType | null)[]
}

export type SuggestionFactor = { label: string; points: number }

export type Suggestion = {
  recipeId: string
  title: string
  totalMinutes: number | null
  /** Motivo principal, uno solo, el de mayor peso que aplique. */
  reason: string
  /** Ingredientes que no están en la despensa; vacío = se puede cocinar ya. */
  missing: string[]
  score: number
  factors: SuggestionFactor[]
}

/**
 * Normaliza para comparar nombres escritos a mano: los ingredientes de receta y
 * los alimentos del hogar son texto libre y rara vez coinciden carácter a carácter.
 */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ponytail: emparejamiento por inclusión de subcadena. Cubre «tomate» ↔ «tomates
// pera»; un catálogo canónico de alimentos con alias es la mejora si falla.
function matches(ingredient: string, food: string): boolean {
  const left = normalize(ingredient)
  const right = normalize(food)
  if (!left || !right) return false
  return left.includes(right) || right.includes(left)
}

function timeReason(totalMinutes: number | null): string | null {
  return totalMinutes && totalMinutes <= QUICK_MINUTES
    ? `Lista en ${totalMinutes} min`
    : null
}

function scoreCandidate(
  candidate: SuggestionCandidate,
  input: SuggestionInput,
): Suggestion {
  const factors: SuggestionFactor[] = []
  const missing: string[] = []
  const priorityUsed: string[] = []

  for (const ingredient of candidate.ingredients) {
    const found = input.pantry.find((item) => matches(ingredient, item.name))
    if (!found) missing.push(ingredient)
    else if (found.priority) priorityUsed.push(found.name)
  }

  // Sin ingredientes registrados no podemos afirmar disponibilidad: puntúa 0 en
  // vez de 100 %, para no premiar a las recetas incompletas.
  const total = candidate.ingredients.length
  const availableRatio = total ? (total - missing.length) / total : 0
  if (availableRatio > 0) {
    factors.push({
      label: 'Disponibilidad',
      points: Math.round(SUGGESTION_WEIGHTS.availability * availableRatio),
    })
  }
  if (priorityUsed.length) {
    factors.push({
      label: 'Producto prioritario',
      points: SUGGESTION_WEIGHTS.priorityFood,
    })
  }
  if (candidate.isFavorite) {
    factors.push({ label: 'Favorita', points: SUGGESTION_WEIGHTS.favorite })
  }
  if (candidate.rating && candidate.rating > 3) {
    factors.push({
      label: `Puntuada ${candidate.rating}`,
      points: SUGGESTION_WEIGHTS.ratingPoint * (candidate.rating - 3),
    })
  }
  const varies =
    candidate.dishType !== null &&
    !input.plannedDishTypes.includes(candidate.dishType)
  if (varies) {
    factors.push({ label: 'Variedad', points: SUGGESTION_WEIGHTS.variety })
  }
  const quick = timeReason(candidate.totalMinutes)
  if (quick) {
    factors.push({ label: 'Tiempo', points: SUGGESTION_WEIGHTS.quick })
  }
  const isMediterranean = candidate.categories.some(
    (category) => normalize(category) === 'mediterranea',
  )
  if (isMediterranean) {
    factors.push({
      label: 'Mediterránea',
      points: SUGGESTION_WEIGHTS.mediterranean,
    })
  }
  if (input.plannedRecipeIds.includes(candidate.id)) {
    factors.push({ label: 'Repetida', points: SUGGESTION_WEIGHTS.repeated })
  }

  // Un único motivo, por orden de peso: aprovechar > rapidez > variedad.
  const reason =
    (priorityUsed[0] ? `Aprovecha ${priorityUsed[0]}` : null) ??
    quick ??
    (varies ? 'Para variar esta semana' : null) ??
    (missing.length === 0 && total > 0
      ? 'La tienes a mano'
      : 'De tu biblioteca')

  return {
    recipeId: candidate.id,
    title: candidate.title,
    totalMinutes: candidate.totalMinutes,
    reason,
    missing,
    score: factors.reduce((sum, factor) => sum + factor.points, 0),
    factors,
  }
}

/**
 * Devuelve como mucho tres sugerencias, ordenadas de forma determinista: a igual
 * puntuación gana el título alfabético y, si empata, el id. Dos ejecuciones con
 * los mismos datos dan siempre el mismo resultado.
 */
export function rankSuggestions(input: SuggestionInput): Suggestion[] {
  return input.candidates
    .map((candidate) => scoreCandidate(candidate, input))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.localeCompare(right.title, 'es') ||
        left.recipeId.localeCompare(right.recipeId),
    )
    .slice(0, SUGGESTION_COUNT)
}

/** Línea de disponibilidad de Plan P2. */
export function availabilityLabel(missing: string[]): string {
  return missing.length === 0
    ? 'Puedes prepararla con lo que tienes'
    : `Necesitas comprar: ${missing.join(', ')}`
}
