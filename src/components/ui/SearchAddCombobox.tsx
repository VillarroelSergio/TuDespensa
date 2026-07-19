'use client'

import { useRef, useState } from 'react'

type Props = { zoneLabel: string; suggestions: string[]; onAdd: (food: string) => void }
export function SearchAddCombobox({ zoneLabel, suggestions, onAdd }: Props) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const add = (food: string) => { const clean = food.trim(); if (clean) onAdd(clean); setValue(''); input.current?.focus() }
  return <div className="combobox-wrap">
    <label htmlFor="food-search">Añade un alimento</label>
    <input id="food-search" ref={input} role="combobox" aria-autocomplete="list" aria-controls="food-options" aria-expanded={Boolean(value)} aria-label={`Añadir alimento al ${zoneLabel}`} value={value}
      placeholder="Ej.: leche" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(value) } if (e.key === 'Escape') setValue('') }} />
    {value ? <div id="food-options" role="listbox"><button type="button" className="text-action" onClick={() => add(value)}>Añadir «{value}»</button></div> : null}
    <div className="chips" aria-label="Alimentos habituales">{suggestions.map((suggestion) => <button type="button" className="chip" key={suggestion} onClick={() => add(suggestion)}>+ {suggestion}</button>)}</div>
  </div>
}
