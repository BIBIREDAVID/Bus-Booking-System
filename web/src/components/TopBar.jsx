export default function TopBar({ title, actions }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-brand-600 px-5 py-4 text-white shadow-sm">
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      {actions}
    </header>
  )
}
