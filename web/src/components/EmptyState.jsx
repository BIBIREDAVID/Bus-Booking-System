import { Loader2 } from 'lucide-react'

export function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          <Icon size={18} strokeWidth={2} />
        </div>
      )}
      <p className="max-w-xs text-sm text-ink-500">{message}</p>
    </div>
  )
}

export function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-500">
      <Loader2 size={18} strokeWidth={2} className="animate-spin text-brand-500" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
