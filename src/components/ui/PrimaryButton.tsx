import { useId } from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { disabledReason?: string }

export function PrimaryButton({ disabledReason, onClick, children, ...props }: Props) {
  const unavailable = Boolean(disabledReason)
  // `useId` en vez de id="action-reason": con dos botones bloqueados en la
  // misma pantalla (p. ej. Hogar) se repetía el id y el aria-describedby de
  // ambos apuntaba al mismo texto.
  const reasonId = useId()
  return <div className="action-group">
    {disabledReason ? <p id={reasonId} className="action-reason">{disabledReason}</p> : null}
    <button {...props} className="primary-button" aria-disabled={unavailable} aria-describedby={disabledReason ? reasonId : undefined}
      onClick={(event) => { if (unavailable) { event.preventDefault(); return }; onClick?.(event) }}>
      {children}
    </button>
  </div>
}
