import { NavLink, Outlet } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import LogoutButton from '../../components/LogoutButton'

const links = [
  { to: '/staff', label: 'Manifest' },
  { to: '/staff/bookings', label: 'Manual booking' },
  { to: '/staff/pending-payments', label: 'Pending payments' },
  { to: '/staff/checkin', label: 'Check-in' },
  { to: '/staff/lost-found', label: 'Lost & found' },
]

export default function StaffLayout() {
  return (
    <div className="flex min-h-screen bg-brand-50">
      <aside className="hidden w-56 flex-col border-r border-brand-100 bg-white p-4 sm:flex">
        <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Staff
        </p>
        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/staff'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-semibold ${
                  isActive ? 'bg-brand-100 text-brand-700' : 'text-ink-700 hover:bg-brand-50'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <TopBar title="Park Staff Dashboard" actions={<LogoutButton />} />
        <main className="flex-1 px-5 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
