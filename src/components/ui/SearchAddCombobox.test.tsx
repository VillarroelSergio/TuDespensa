import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SearchAddCombobox } from './SearchAddCombobox'

describe('SearchAddCombobox', () => {
  afterEach(cleanup)
  it('adds text with Enter and keeps focus', () => {
    const onAdd = vi.fn()
    render(<SearchAddCombobox zoneLabel="frigorífico" suggestions={[]} onAdd={onAdd} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Leche' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith('Leche')
    expect(input).toHaveFocus()
  })

  it('adds a suggestion and clears the query', () => {
    const onAdd = vi.fn()
    render(<SearchAddCombobox zoneLabel="frigorífico" suggestions={['Huevos']} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Huevos' }))
    expect(onAdd).toHaveBeenCalledWith('Huevos')
    expect(screen.getByRole('combobox')).toHaveValue('')
  })
})
