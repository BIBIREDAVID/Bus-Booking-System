import { NavLink, Outlet } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import LogoutButton from '../../components/LogoutButton'

const links = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/routes', label: 'Routes' },
  { to: '/admin/schedules', label: 'Schedules' },
  { to: '/admin/trips', label: 'Trips' },
  { to: '/admin/bookings', label: 'Bookings' },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/fleet', label: 'Fleet & Drivers' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/complaints', label: 'Complaints' },
  { to: '/admin/support', label: 'Support Tickets' },
  { to: '/admin/alerts', label: 'Travel Alerts' },
  { to: '/admin/promote', label: 'Promote User' },
]

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-brand-50">
      <aside className="hidden w-56 flex-col border-r border-brand-100 bg-white p-4 sm:flex">
        <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Admin
        </p>
        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/admin'}
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
        <TopBar title="Admin Dashboard" actions={<LogoutButton />} />
        <main className="flex-1 px-5 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
