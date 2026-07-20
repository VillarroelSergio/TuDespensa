'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

import { saveRecipe } from './actions'
import { DISH_TYPE_OPTIONS, UNIT_OPTIONS } from './presentation'
import type { RecipeDetail, RecipeDishType } from './types'

type IngredientDraft = { name: string; quantity: string; unitCode: string }

function toDraftIngredients(recipe: RecipeDetail): IngredientDraft[] {
  const rows = recipe.ingredients.map((row) => ({ name: row.name, quantity: row.quantity === null ? '' : String(row.quantity), unitCode: row.unitCode ?? '' }))
  return rows.length ? rows : [{ name: '', quantity: '', unitCode: '' }]
}

export function RecipeEditor({ recipe }: { recipe: RecipeDetail }) {
  const router = useRouter()
  const [title, setTitle] = useState(recipe.status === 'pending' ? '' : recipe.title)
  const [servings, setServings] = useState(recipe.servings === null ? '' : String(recipe.servings))
  const [minutes, setMinutes] = useState(recipe.totalMinutes === null ? '' : String(recipe.totalMinutes))
  const [dishType, setDishType] = useState<'' | RecipeDishType>(recipe.dishType ?? '')
  const [sourceUrl, setSourceUrl] = useState(recipe.sourceUrl ?? '')
  const [showMore, setShowMore] = useState(Boolean(recipe.dishType || recipe.sourceUrl))
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(() => toDraftIngredients(recipe))
  const [steps, setSteps] = useState<string[]>(recipe.steps.length ? recipe.steps.map((step) => step.instruction) : [''])
  const [version, setVersion] = useState(recipe.version)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [conflict, setConflict] = useState(false)

  function updateIngredient(index: number, patch: Partial<IngredientDraft>) {
    setIngredients((rows) => rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !title.trim()) return
    setSaving(true); setMessage(''); setConflict(false)
    const parsedMinutes = minutes.trim() ? Number.parseInt(minutes, 10) : null
    const parsedServings = servings.trim() ? Number.parseInt(servings, 10) : null
    const result = await saveRecipe({
      recipeId: recipe.id,
      version,
      title: title.trim(),
      dishType: dishType || null,
      totalMinutes: Number.isNaN(parsedMinutes as number) ? null : parsedMinutes,
      servings: Number.isNaN(parsedServings as number) ? null : parsedServings,
      sourceUrl: sourceUrl.trim() || null,
      ingredients: ingredients
        .filter((row) => row.name.trim())
        .map((row) => ({ name: row.name.trim(), quantity: row.quantity.trim() ? Number(row.quantity) : null, unitCode: row.unitCode || null })),
      steps,
    }).catch(() => ({ ok: false, reason: 'error' as const }))
    setSaving(false)
    if (result.ok) { setVersion(result.version); router.push(`/recetas/${recipe.id}`); return }
    // ponytail: en conflicto conservamos lo visible e informamos; un merge fila a fila es 4C si hace falta.
    if (result.reason === 'conflict') { setConflict(true); setMessage('Esta receta cambió en otra sesión. Abre la versión actual para no pisar cambios.') }
    else if (result.reason === 'invalid') setMessage('Revisa los campos marcados antes de guardar.')
    else setMessage('No hemos podido guardar. Tu texto sigue aquí; puedes reintentar.')
  }

  return <main className="recipe-editor">
    <a className="recipe-back" href={`/recetas/${recipe.id}`}>← Volver</a>
    <form className="recipe-editor__form" onSubmit={submit}>
      <h1>{recipe.status === 'pending' ? 'Revisar receta' : 'Editar receta'}</h1>
      {recipe.sourceUrl ? <p className="recipe-source">Origen: <a href={recipe.sourceUrl} rel="noreferrer" target="_blank">{recipe.sourceUrl}</a></p> : null}

      <label htmlFor="editor-title">Nombre de la receta</label>
      <input id="editor-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Nombre de la receta" autoFocus required />

      <div className="recipe-editor__row">
        <div>
          <label htmlFor="editor-servings">Raciones</label>
          <input id="editor-servings" value={servings} onChange={(event) => setServings(event.target.value)} inputMode="numeric" min={1} max={99} placeholder="Opcional" type="number" />
        </div>
        <div>
          <label htmlFor="editor-minutes">Tiempo (min)</label>
          <input id="editor-minutes" value={minutes} onChange={(event) => setMinutes(event.target.value)} inputMode="numeric" min={0} max={1440} placeholder="Opcional" type="number" />
        </div>
      </div>

      <fieldset className="recipe-editor__group">
        <legend>Ingredientes</legend>
        {ingredients.map((row, index) => <div className="recipe-ingredient-row" key={index}>
          <label className="sr-only" htmlFor={`ing-name-${index}`}>Ingrediente</label>
          <input id={`ing-name-${index}`} value={row.name} onChange={(event) => updateIngredient(index, { name: event.target.value })} maxLength={120} placeholder="Ingrediente" />
          <label className="sr-only" htmlFor={`ing-qty-${index}`}>Cantidad</label>
          <input id={`ing-qty-${index}`} value={row.quantity} onChange={(event) => updateIngredient(index, { quantity: event.target.value })} inputMode="decimal" min={0} placeholder="Cant." type="number" />
          <label className="sr-only" htmlFor={`ing-unit-${index}`}>Unidad</label>
          <select id={`ing-unit-${index}`} value={row.unitCode} onChange={(event) => updateIngredient(index, { unitCode: event.target.value })}>
            <option value="">—</option>
            {UNIT_OPTIONS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
          </select>
          <button type="button" className="recipe-row-remove" onClick={() => setIngredients((rows) => rows.filter((_, position) => position !== index))} aria-label="Quitar ingrediente">×</button>
        </div>)}
        <button type="button" className="recipe-row-add" onClick={() => setIngredients((rows) => [...rows, { name: '', quantity: '', unitCode: '' }])}>Añadir ingrediente</button>
      </fieldset>

      <fieldset className="recipe-editor__group">
        <legend>Pasos</legend>
        {steps.map((step, index) => <div className="recipe-step-row" key={index}>
          <label className="sr-only" htmlFor={`step-${index}`}>Paso {index + 1}</label>
          <textarea id={`step-${index}`} value={step} onChange={(event) => setSteps((rows) => rows.map((value, position) => (position === index ? event.target.value : value)))} maxLength={2000} rows={2} placeholder={index === 0 ? 'Añade el primer paso' : 'Siguiente paso'} />
          <button type="button" className="recipe-row-remove" onClick={() => setSteps((rows) => rows.filter((_, position) => position !== index))} aria-label="Quitar paso">×</button>
        </div>)}
        <button type="button" className="recipe-row-add" onClick={() => setSteps((rows) => [...rows, ''])}>Añadir paso</button>
      </fieldset>

      <button type="button" className="recipe-more-toggle" onClick={() => setShowMore((open) => !open)} aria-expanded={showMore}>Más detalles</button>
      {showMore ? <div className="recipe-editor__more">
        <label htmlFor="editor-dish">Tipo de plato</label>
        <select id="editor-dish" value={dishType} onChange={(event) => setDishType(event.target.value as '' | RecipeDishType)}>
          <option value="">Sin especificar</option>
          {DISH_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <label htmlFor="editor-source">Enlace de origen</label>
        <input id="editor-source" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} maxLength={2048} placeholder="https://…" type="url" />
      </div> : null}

      {message ? <p className="recipe-editor__status" aria-live="polite">{message}{conflict ? <> {' '}<a href={`/recetas/${recipe.id}`}>Ver versión actual</a></> : null}</p> : null}
      <button className="recipe-editor__save" type="submit" disabled={saving || !title.trim()}>{saving ? 'Guardando…' : 'Guardar receta'}</button>
    </form>
  </main>
}
