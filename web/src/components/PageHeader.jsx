export default function PageHeader({ icon: Icon, title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Icon size={19} strokeWidth={2} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold leading-tight text-ink-900">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
