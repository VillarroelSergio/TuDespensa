import type { RecipeDishType } from '@/modules/recipes/types'

import { classifyFoodGroup, foodGroupLabel, type FoodGroup } from './foodGroups'

/**
 * Pesos versionados del ranking. Subir la versión al cambiar cualquier peso:
 * es lo que permite explicar por qué una sugerencia de ayer no sale hoy.
 */
export const SUGGESTION_WEIGHTS_VERSION = 2

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
  /** Su grupo (legumbre, carne roja...) aún no aparece esta semana. */
  balanceBonus: 6,
  /** Su grupo ya aparece 2 o más veces esta semana: dieta equilibrada, no monótona. */
  balancePenalty: -18,
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
  /** Grupo de alimento de cada comida ya planificada esta semana (equilibrio). */
  plannedFoodGroups?: (FoodGroup | null)[]
  /** Catálogo canónico de alimentos, si hay uno disponible para emparejar mejor. */
  catalog?: CatalogEntry[]
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

// Palabras de relleno de una ficha de receta que no identifican el alimento
// («pan del día anterior», «ajo pequeño»). Ceiling: lista fija y corta: cubre
// artículos/adjetivos habituales del catálogo de recetas, no es exhaustiva.
const FILLER_WORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'al', 'en', 'para',
  'dia', 'anterior',
  'pequeno', 'pequena', 'pequenos', 'pequenas', 'grande', 'grandes',
  'fresco', 'fresca', 'frescos', 'frescas',
  'frio', 'fria', 'frios', 'frias',
  'maduro', 'madura', 'maduros', 'maduras',
])

function stripFillers(normalized: string): string {
  const words = normalized.split(' ').filter((word) => !FILLER_WORDS.has(word))
  return words.join(' ') || normalized
}

/** Compara dos palabras ya normalizadas tolerando un plural simple («tomate»/«tomates»). */
function wordsEqual(a: string, b: string): boolean {
  if (a === b) return true
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return longer === shorter + 's' || longer === shorter + 'es'
}

/** ¿Aparece `needle` como secuencia de palabras completas y seguidas dentro de `haystack`? */
function containsWordSequence(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    if (needle.every((word, offset) => wordsEqual(haystack[start + offset] ?? '', word))) {
      return true
    }
  }
  return false
}

/** Alimento canónico del catálogo con sus sinónimos, ya listos para comparar. */
export type CatalogEntry = {
  canonicalName: string
  /** Nombre canónico + alias, normalizados y sin relleno. */
  normalizedTerms: string[]
}

/** Prepara filas crudas del catálogo (nombre + alias) como `CatalogEntry[]`. */
export function buildCatalogEntries(
  rows: { canonicalName: string; terms: string[] }[],
): CatalogEntry[] {
  return rows.map((row) => ({
    canonicalName: row.canonicalName,
    normalizedTerms: row.terms.map((term) => stripFillers(normalize(term))),
  }))
}

// Coincidencia EXACTA (tras quitar relleno) contra el nombre canónico o un
// alias del catálogo. Nada de «contiene»: si fuera por subcadena, «pan
// rallado» se colaría dentro de «pan» igual que antes pasaba con «empanadillas».
// El catálogo es la capa precisa y curada; la tolerancia a texto parecido
// queda solo en el emparejamiento de texto de más abajo.
function resolveCatalogName(
  value: string,
  catalog: CatalogEntry[],
): string | null {
  const stripped = stripFillers(normalize(value))
  if (!stripped) return null
  const entry = catalog.find((candidate) =>
    candidate.normalizedTerms.includes(stripped),
  )
  return entry?.canonicalName ?? null
}

// ponytail: primero intenta el catálogo canónico de alimentos, si se pasa uno
// (mismo que usa Compra para la zona por defecto); si alguno de los dos
// nombres no resuelve ahí, cae al emparejamiento por texto de siempre —
// palabra completa, tolerando plural simple, no solo coincidencia de subcadena.
// Exportado para que Fase 8 empareje ingrediente↔despensa con la misma regla.
export function matches(
  ingredient: string,
  food: string,
  catalog: CatalogEntry[] = [],
): boolean {
  if (catalog.length) {
    const ingredientCanonical = resolveCatalogName(ingredient, catalog)
    const foodCanonical = resolveCatalogName(food, catalog)
    if (ingredientCanonical && foodCanonical) {
      return ingredientCanonical === foodCanonical
    }
  }
  const left = stripFillers(normalize(ingredient))
  const right = stripFillers(normalize(food))
  if (!left || !right) return false
  const leftWords = left.split(' ')
  const rightWords = right.split(' ')
  return (
    containsWordSequence(leftWords, rightWords) ||
    containsWordSequence(rightWords, leftWords)
  )
}

/**
 * Ingredientes que no están en la despensa. Es lo que explica la disponibilidad
 * de una sugerencia y, en Fase 6, lo que se consolida en Compra.
 */
export function missingIngredients(
  ingredients: string[],
  pantry: SuggestionPantryItem[],
  catalog: CatalogEntry[] = [],
): string[] {
  return ingredients.filter(
    (ingredient) =>
      !pantry.some((item) => matches(ingredient, item.name, catalog)),
  )
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
  const catalog = input.catalog ?? []
  const missing = missingIngredients(candidate.ingredients, input.pantry, catalog)
  const priorityUsed = input.pantry
    .filter(
      (item) =>
        item.priority &&
        candidate.ingredients.some((ingredient) =>
          matches(ingredient, item.name, catalog),
        ),
    )
    .map((item) => item.name)

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

  // Equilibrio semanal: cuenta cuántas veces ya aparece el grupo de esta
  // receta (legumbre, carne roja...) entre lo ya planificado, y penaliza la
  // sobrerrepresentación en vez de prohibirla, igual que «Repetida».
  const foodGroup = classifyFoodGroup(candidate.ingredients)
  const groupOccurrences = foodGroup
    ? (input.plannedFoodGroups ?? []).filter((group) => group === foodGroup)
        .length
    : 0
  let balanceReason: string | null = null
  if (foodGroup && groupOccurrences >= 2) {
    factors.push({
      label: `Ya llevas ${foodGroupLabel(foodGroup)} ${groupOccurrences} veces esta semana`,
      points: SUGGESTION_WEIGHTS.balancePenalty,
    })
  } else if (foodGroup && groupOccurrences === 0) {
    factors.push({
      label: 'Equilibrio semanal',
      points: SUGGESTION_WEIGHTS.balanceBonus,
    })
    balanceReason = `Esta semana aún no has tomado ${foodGroupLabel(foodGroup)}`
  }

  // Un único motivo, por orden de peso: aprovechar > rapidez > variedad > equilibrio.
  const reason =
    (priorityUsed[0] ? `Aprovecha ${priorityUsed[0]}` : null) ??
    quick ??
    (varies ? 'Para variar esta semana' : null) ??
    balanceReason ??
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
export function rankSuggestions(
  input: SuggestionInput,
  count = SUGGESTION_COUNT,
): Suggestion[] {
  return input.candidates
    .map((candidate) => scoreCandidate(candidate, input))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.localeCompare(right.title, 'es') ||
        left.recipeId.localeCompare(right.recipeId),
    )
    .slice(0, count)
}

/** Línea de disponibilidad de Plan P2. */
export function availabilityLabel(missing: string[]): string {
  return missing.length === 0
    ? 'Puedes prepararla con lo que tienes'
    : `Necesitas comprar: ${missing.join(', ')}`
}
