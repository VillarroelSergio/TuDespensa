/**
 * Clasificación heurística por ingredientes: da a `suggestions.ts` una señal de
 * equilibrio semanal (no repetir legumbres o carne cada día) sin depender de un
 * catálogo de alimentos nuevo. Si ningún término coincide, la receta no cuenta
 * para ningún grupo (verduras, pasta sola, etc. no penalizan ni premian).
 */
export type FoodGroup = 'legumbre' | 'pescado' | 'ave' | 'carne_roja' | 'huevo'

const FOOD_GROUP_LABELS: Record<FoodGroup, string> = {
  legumbre: 'legumbres',
  pescado: 'pescado',
  ave: 'pollo o pavo',
  carne_roja: 'carne roja',
  huevo: 'huevo',
}

// Orden = prioridad de coincidencia: una receta de «lentejas con chorizo» cuenta
// como legumbre, no como carne roja, porque el chorizo es un extra, no el centro.
const KEYWORDS: [FoodGroup, string[]][] = [
  ['legumbre', ['lenteja', 'garbanzo', 'alubia', 'judia blanca', 'habas']],
  [
    'pescado',
    [
      'salmon',
      'atun',
      'merluza',
      'bacalao',
      'gamba',
      'langostino',
      'sepia',
      'calamar',
      'pescado',
      'marisco',
      'trucha',
      'boqueron',
    ],
  ],
  ['ave', ['pollo', 'pavo']],
  [
    'carne_roja',
    [
      'ternera',
      'cerdo',
      'cordero',
      'carne picada',
      'chorizo',
      'lomo',
      'solomillo',
    ],
  ],
  ['huevo', ['huevo']],
]

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
}

/** Grupo dominante de una receta a partir de sus ingredientes; null si no aplica. */
export function classifyFoodGroup(ingredients: string[]): FoodGroup | null {
  const text = normalize(ingredients.join(' '))
  for (const [group, keywords] of KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) return group
  }
  return null
}

export function foodGroupLabel(group: FoodGroup): string {
  return FOOD_GROUP_LABELS[group]
}
