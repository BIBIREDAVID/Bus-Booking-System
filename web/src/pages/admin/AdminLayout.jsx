import {
  LayoutDashboard,
  Route as RouteIcon,
  CalendarClock,
  Bus,
  Ticket,
  Wallet,
  Truck,
  BarChart3,
  MessageSquareWarning,
  LifeBuoy,
  Megaphone,
  UserPlus,
} from 'lucide-react'
import DashboardShell from '../../components/DashboardShell'

const sections = [
  {
    items: [{ to: '/admin', end: true, icon: LayoutDashboard, label: 'Overview' }],
  },
  {
    label: 'Network',
    items: [
      { to: '/admin/routes', icon: RouteIcon, label: 'Routes' },
      { to: '/admin/schedules', icon: CalendarClock, label: 'Schedules' },
      { to: '/admin/trips', icon: Bus, label: 'Trips' },
      { to: '/admin/fleet', icon: Truck, label: 'Fleet & Drivers' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { to: '/admin/bookings', icon: Ticket, label: 'Bookings' },
      { to: '/admin/payments', icon: Wallet, label: 'Payments' },
      { to: '/admin/reports', icon: BarChart3, label: 'Reports' },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/admin/complaints', icon: MessageSquareWarning, label: 'Complaints' },
      { to: '/admin/support', icon: LifeBuoy, label: 'Support Tickets' },
      { to: '/admin/alerts', icon: Megaphone, label: 'Travel Alerts' },
    ],
  },
  {
    label: 'Admin',
    items: [{ to: '/admin/promote', icon: UserPlus, label: 'Promote User' }],
  },
]

export default function AdminLayout() {
  return <DashboardShell brandLabel="Admin" title="Admin Dashboard" sections={sections} />
}
