'use client'

import { useId, useRef, useState } from 'react'

type Props = { zoneLabel: string; suggestions: string[]; onAdd: (food: string) => void }
export function SearchAddCombobox({ zoneLabel, suggestions, onAdd }: Props) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  // `useId` en vez de un id fijo: dos zonas en la misma pantalla generaban dos
  // elementos con id="food-search" y la etiqueta apuntaba solo al primero.
  const fieldId = useId()
  const add = (food: string) => { const clean = food.trim(); if (clean) onAdd(clean); setValue(''); input.current?.focus() }
  return <div className="combobox-wrap">
    {/* La etiqueta visible ES el nombre accesible. Antes había además un
        aria-label distinto que la sustituía, así que quien navega por voz
        pedía «Añade un alimento» y el campo no respondía (WCAG 2.5.3). */}
    <label htmlFor={fieldId}>Añade un alimento al {zoneLabel}</label>
    <input id={fieldId} ref={input} type="search" value={value}
      placeholder="Ej.: leche" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(value) } if (e.key === 'Escape') setValue('') }} />
    {value ? <div><button type="button" className="text-action" onClick={() => add(value)}>Añadir «{value}»</button></div> : null}
    <div className="chips" role="group" aria-label="Alimentos habituales">{suggestions.map((suggestion) => <button type="button" className="chip" key={suggestion} onClick={() => add(suggestion)}>+ {suggestion}</button>)}</div>
  </div>
}
