import { Construction } from 'lucide-react'
import Card from './Card'

export default function Placeholder({ title, description }) {
  return (
    <Card className="flex flex-col items-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Construction size={22} strokeWidth={2} />
      </div>
      <h2 className="mt-4 text-xl font-bold text-ink-900">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-sm text-ink-500">{description}</p>}
    </Card>
  )
}
