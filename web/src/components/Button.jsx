const variants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  outline: 'border border-brand-600 text-brand-600 hover:bg-brand-50',
  ghost: 'text-ink-700 hover:bg-brand-100',
  light: 'bg-white text-brand-600 hover:bg-white/90',
}

const radii = {
  pill: 'rounded-[var(--radius-pill)]',
  lg: 'rounded-2xl',
}

export default function Button({ variant = 'primary', radius = 'pill', className = '', ...props }) {
  return (
    <button
      className={`${radii[radius]} px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
