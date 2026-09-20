import Card from './Card'

export default function Placeholder({ title, description }) {
  return (
    <Card>
      <h2 className="text-xl font-bold text-ink-900">{title}</h2>
      {description && <p className="mt-2 text-sm text-ink-500">{description}</p>}
    </Card>
  )
}
