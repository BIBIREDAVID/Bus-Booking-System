import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Route as RouteIcon,
  CalendarClock,
  Bus,
  Truck,
  MessageSquareWarning,
  LifeBuoy,
  Megaphone,
  UserPlus,
} from 'lucide-react'
import Card from '../../components/Card'
import { ApiError, getOpenTicketsReport, getRevenueReport, getOccupancyReport } from '../../lib/api'

function naira(n) {
  return `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function pct(n) {
  return `${Math.round(n * 100)}%`
}

function StatCard({ label, value, tone }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone ?? 'text-ink-900'}`}>{value}</p>
    </Card>
  )
}

const QUICK_LINKS = [
  { to: '/admin/routes', icon: RouteIcon, label: 'Routes', description: 'Origins, destinations, fares' },
  { to: '/admin/schedules', icon: CalendarClock, label: 'Schedules', description: 'Recurring departures' },
  { to: '/admin/trips', icon: Bus, label: 'Trips', description: 'Assign buses & drivers' },
  { to: '/admin/fleet', icon: Truck, label: 'Fleet & Drivers', description: 'Buses and driver roster' },
  { to: '/admin/complaints', icon: MessageSquareWarning, label: 'Complaints', description: 'Triage open cases' },
  { to: '/admin/support', icon: LifeBuoy, label: 'Support Tickets', description: 'Answer rider issues' },
  { to: '/admin/alerts', icon: Megaphone, label: 'Travel Alerts', description: 'Post delay/route notices' },
  { to: '/admin/promote', icon: UserPlus, label: 'Promote User', description: 'Grant staff/admin access' },
]

export default function Overview() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState(null)
  const [revenue, setRevenue] = useState(null)
  const [occupancy, setOccupancy] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getOpenTicketsReport(), getRevenueReport(), getOccupancyReport()])
      .then(([t, r, o]) => {
        setTickets(t)
        setRevenue(r)
        setOccupancy(o)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load overview'))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <Card tone="brand">
        <p className="text-sm text-white/80">Welcome back</p>
        <h2 className="mt-1 text-xl font-bold">All-time snapshot across every route</h2>
        <p className="mt-2 text-sm text-white/80">
          Head to Reports for date-range filtering, revenue/occupancy charts, and per-driver ratings.
        </p>
      </Card>

      {error && <p className="text-sm text-brand-700">{error}</p>}

      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">At a Glance</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total Revenue" value={revenue ? naira(revenue.totalRevenue) : '—'} tone="text-brand-600" />
          <StatCard label="Paid Bookings" value={revenue ? revenue.bookingCount : '—'} />
          <StatCard
            label="Occupancy"
            value={occupancy ? pct(occupancy.overallOccupancyRate) : '—'}
            tone={occupancy && occupancy.overallOccupancyRate >= 0.5 ? 'text-green-700' : 'text-yellow-700'}
          />
          <StatCard label="Open Complaints" value={tickets ? tickets.complaints.open : '—'} tone="text-brand-600" />
          <StatCard label="Open Tickets" value={tickets ? tickets.supportTickets.open : '—'} tone="text-brand-600" />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.to}
              type="button"
              onClick={() => navigate(link.to)}
              className="flex items-start gap-3 rounded-[var(--radius-card)] bg-white p-4 text-left shadow-[0_8px_24px_-12px_rgba(28,22,32,0.18)] transition-transform hover:-translate-y-0.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <link.icon size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-bold text-ink-900">{link.label}</p>
                <p className="mt-0.5 text-xs text-ink-500">{link.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
