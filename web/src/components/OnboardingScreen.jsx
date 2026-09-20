import { useNavigate } from 'react-router-dom'

export default function OnboardingScreen({ title, subtitle, onBack, children }) {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-8">
      {onBack !== false && (
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate(-1))}
          aria-label="Back"
          className="mb-6 flex h-9 w-9 items-center justify-center rounded-full text-ink-900 hover:bg-brand-50"
        >
          ←
        </button>
      )}

      {title && <h1 className="text-2xl font-bold text-ink-900">{title}</h1>}
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-500">{subtitle}</p>}

      <div className="mt-8 flex flex-1 flex-col">{children}</div>
    </div>
  )
}
