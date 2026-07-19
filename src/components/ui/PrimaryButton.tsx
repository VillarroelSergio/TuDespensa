type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { disabledReason?: string }

export function PrimaryButton({ disabledReason, onClick, children, ...props }: Props) {
  const unavailable = Boolean(disabledReason)
  return <div className="action-group">
    {disabledReason ? <p id="action-reason" className="action-reason">{disabledReason}</p> : null}
    <button {...props} className="primary-button" aria-disabled={unavailable} aria-describedby={disabledReason ? 'action-reason' : undefined}
      onClick={(event) => { if (unavailable) { event.preventDefault(); return }; onClick?.(event) }}>
      {children}
    </button>
  </div>
}
