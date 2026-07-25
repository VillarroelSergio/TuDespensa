import { describe, expect, it } from 'vitest'

import {
  availabilityLabel,
  missingIngredients,
  rankSuggestions,
  type SuggestionCandidate,
  type SuggestionInput,
} from './suggestions'

const candidate = (
  overrides: Partial<SuggestionCandidate> = {},
): SuggestionCandidate => ({
  id: 'recipe-1',
  title: 'Gazpacho andaluz',
  totalMinutes: 60,
  dishType: 'main',
  isFavorite: false,
  rating: null,
  categories: [],
  ingredients: ['tomate'],
  ...overrides,
})

const input = (overrides: Partial<SuggestionInput> = {}): SuggestionInput => ({
  candidates: [candidate()],
  pantry: [],
  plannedRecipeIds: [],
  plannedDishTypes: [],
  ...overrides,
})

describe('rankSuggestions', () => {
  it('devuelve como mucho tres sugerencias', () => {
    const candidates = Array.from({ length: 6 }, (_unused, index) =>
      candidate({ id: `recipe-${index}`, title: `Receta ${index}` }),
    )
    expect(rankSuggestions(input({ candidates }))).toHaveLength(3)
  })

  it('es determinista: a igual puntuación ordena por título', () => {
    const candidates = [
      candidate({ id: 'b', title: 'Sopa de melón' }),
      candidate({ id: 'a', title: 'Arroz caldoso' }),
    ]
    const first = rankSuggestions(input({ candidates }))
    const second = rankSuggestions(input({ candidates: [...candidates] }))
    expect(first.map((row) => row.recipeId)).toEqual(['a', 'b'])
    expect(second).toEqual(first)
  })

  it('marca lo que falta comprar e ignora tildes y mayúsculas', () => {
    const [suggestion] = rankSuggestions(
      input({
        candidates: [candidate({ ingredients: ['Melón', 'jamón'] })],
        pantry: [{ name: 'melon', priority: false }],
      }),
    )
    expect(suggestion!.missing).toEqual(['jamón'])
  })

  it('no falta nada cuando la despensa cubre los ingredientes', () => {
    const [suggestion] = rankSuggestions(
      input({ pantry: [{ name: 'Tomates pera', priority: false }] }),
    )
    expect(suggestion!.missing).toEqual([])
    expect(availabilityLabel(suggestion!.missing)).toBe(
      'Puedes prepararla con lo que tienes',
    )
  })

  it('explica con un solo motivo, el de más peso', () => {
    const priority = rankSuggestions(
      input({
        candidates: [candidate({ totalMinutes: 10 })],
        pantry: [{ name: 'Tomate', priority: true }],
      }),
    )
    expect(priority[0]!.reason).toBe('Aprovecha Tomate')

    const quick = rankSuggestions(
      input({
        candidates: [candidate({ totalMinutes: 10 })],
        pantry: [{ name: 'Tomate', priority: false }],
      }),
    )
    expect(quick[0]!.reason).toBe('Lista en 10 min')

    const variety = rankSuggestions(
      input({ candidates: [candidate({ totalMinutes: 90 })] }),
    )
    expect(variety[0]!.reason).toBe('Para variar esta semana')
  })

  it('hunde una receta ya planificada esta semana', () => {
    const repeated = candidate({ id: 'repetida', title: 'A repetida' })
    const fresh = candidate({ id: 'nueva', title: 'Z nueva' })
    const ranked = rankSuggestions(
      input({
        candidates: [repeated, fresh],
        plannedRecipeIds: ['repetida'],
        plannedDishTypes: ['main'],
      }),
    )
    expect(ranked[0]!.recipeId).toBe('nueva')
    expect(ranked[1]!.score).toBeLessThan(ranked[0]!.score)
  })

  it('no premia la disponibilidad de una receta sin ingredientes', () => {
    const [suggestion] = rankSuggestions(
      input({ candidates: [candidate({ ingredients: [] })] }),
    )
    expect(
      suggestion!.factors.some((factor) => factor.label === 'Disponibilidad'),
    ).toBe(false)
  })

  it('penaliza un grupo de alimento repetido 2+ veces esta semana', () => {
    const lentejas = candidate({
      id: 'lentejas',
      title: 'Lentejas con verduras',
      ingredients: ['lentejas', 'zanahoria'],
      totalMinutes: 90,
    })
    const [suggestion] = rankSuggestions(
      input({
        candidates: [lentejas],
        plannedFoodGroups: ['legumbre', 'legumbre'],
      }),
    )
    expect(
      suggestion!.factors.some(
        (factor) => factor.points < 0 && /legumbres/.test(factor.label),
      ),
    ).toBe(true)
  })

  it('premia y explica un grupo aún no presente esta semana', () => {
    const pescado = candidate({
      id: 'pescado',
      title: 'Merluza al horno',
      ingredients: ['merluza', 'patata'],
      totalMinutes: 90,
    })
    const [suggestion] = rankSuggestions(
      input({
        candidates: [pescado],
        plannedFoodGroups: ['carne_roja'],
        // dishType 'main' ya presente: aísla el motivo de equilibrio del de variedad.
        plannedDishTypes: ['main'],
      }),
    )
    expect(suggestion!.reason).toBe('Esta semana aún no has tomado pescado')
  })

  it('suma favorito, puntuación y mediterránea como factores visibles', () => {
    const [suggestion] = rankSuggestions(
      input({
        candidates: [
          candidate({
            isFavorite: true,
            rating: 5,
            categories: ['Mediterránea'],
          }),
        ],
      }),
    )
    expect(suggestion!.factors.map((factor) => factor.label)).toEqual(
      expect.arrayContaining(['Favorita', 'Puntuada 5', 'Mediterránea']),
    )
  })
})

describe('availabilityLabel', () => {
  it('enumera lo que hay que comprar', () => {
    expect(availabilityLabel(['jamón', 'pan'])).toBe(
      'Necesitas comprar: jamón, pan',
    )
  })
})

describe('missingIngredients', () => {
  it('deja fuera lo que la despensa cubre, ignorando tildes y mayúsculas', () => {
    expect(
      missingIngredients(
        ['Tomate', 'Jamón', 'Pan'],
        [
          { name: 'tomates pera', priority: false },
          { name: 'jamon serrano', priority: true },
        ],
      ),
    ).toEqual(['Pan'])
  })

  it('sin despensa, todo falta', () => {
    expect(missingIngredients(['Sal', 'Agua'], [])).toEqual(['Sal', 'Agua'])
  })
})
