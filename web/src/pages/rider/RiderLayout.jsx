import { NavLink, Outlet } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import LogoutButton from '../../components/LogoutButton'

const tabs = [
  { to: '/', label: 'Home' },
  { to: '/search', label: 'Search' },
  { to: '/bookings', label: 'Bookings' },
  { to: '/updates', label: 'Updates' },
  { to: '/account', label: 'Account' },
]

export default function RiderLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-brand-50">
      <TopBar title="BookMyBus" actions={<LogoutButton />} />
      <main className="flex-1 px-5 py-6">
        <Outlet />
      </main>
      <nav className="sticky bottom-0 flex justify-around border-t border-brand-100 bg-white py-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `rounded-[var(--radius-pill)] px-4 py-2 text-sm font-semibold ${
                isActive ? 'bg-brand-100 text-brand-700' : 'text-ink-500'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
