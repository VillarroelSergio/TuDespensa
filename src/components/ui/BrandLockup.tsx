import Link from 'next/link'

type BrandLockupProps = {
  className?: string
  href?: string
}

/**
 * El símbolo no depende del nombre de trabajo. Si el naming cambia, se
 * sustituye únicamente el texto visible y los metadatos, no el sistema visual.
 */
export function BrandLockup({
  className = 'brand-lockup',
  href = '/plan',
}: BrandLockupProps) {
  return (
    <Link className={className} href={href}>
      <span aria-hidden="true" className="brand-lockup__mark" />
      <span>MiDespensa</span>
    </Link>
  )
}
