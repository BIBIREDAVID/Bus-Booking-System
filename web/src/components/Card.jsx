export default function Card({ children, className = '', tone = 'light' }) {
  const toneClass = tone === 'brand' ? 'bg-brand-600 text-white' : 'bg-white'
  return (
    <div
      className={`rounded-[var(--radius-card)] p-5 shadow-[0_8px_24px_-12px_rgba(28,22,32,0.18)] ${toneClass} ${className}`}
    >
      {children}
    </div>
  )
}
