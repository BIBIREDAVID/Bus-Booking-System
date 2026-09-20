import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Bus, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'

const ROLE_LABEL = {
  admin: 'Administrator',
  park_staff: 'Park Staff',
  rider: 'Rider',
}

function NavItem({ to, end, icon: Icon, label, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-sm font-semibold transition-colors ${
          isActive
            ? 'border-brand-600 bg-brand-50 text-brand-700'
            : 'border-transparent text-ink-700 hover:border-brand-200 hover:bg-brand-50/60'
        }`
      }
    >
      {Icon && <Icon size={18} strokeWidth={2} className="shrink-0" />}
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

function SidebarContent({ brandLabel, sections, onNavigate }) {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-5 pt-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Bus size={18} strokeWidth={2.25} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-extrabold text-ink-900">BookMyBus</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">{brandLabel}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        {sections.map((section) => (
          <div key={section.label ?? 'default'}>
            {section.label && (
              <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-ink-500/70">
                {section.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavItem key={item.to} {...item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-brand-100 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-brand-50/70 p-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {(user?.name ?? user?.phone ?? '?').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-bold text-ink-900">{user?.name ?? user?.phone ?? 'Account'}</p>
            <p className="truncate text-[11px] text-ink-500">{ROLE_LABEL[user?.role] ?? user?.role}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Log out"
            className="shrink-0 rounded-lg p-1.5 text-ink-500 hover:bg-white hover:text-brand-700"
          >
            <LogOut size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DashboardShell({ brandLabel, title, sections }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-brand-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-brand-100 bg-white sm:flex">
        <SidebarContent brandLabel={brandLabel} sections={sections} />
      </aside>

      {/* Mobile slide-over sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 h-full w-72 bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-500 hover:bg-brand-50"
            >
              <X size={18} />
            </button>
            <SidebarContent brandLabel={brandLabel} sections={sections} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 bg-brand-600 px-4 py-4 text-white shadow-sm sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 hover:bg-white/10 sm:hidden"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
