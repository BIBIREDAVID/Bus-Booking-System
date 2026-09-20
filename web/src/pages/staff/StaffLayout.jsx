import { ClipboardList, UserPlus, Wallet, ScanLine, PackageSearch } from 'lucide-react'
import DashboardShell from '../../components/DashboardShell'

const sections = [
  {
    items: [{ to: '/staff', end: true, icon: ClipboardList, label: 'Manifest' }],
  },
  {
    label: 'Counter',
    items: [
      { to: '/staff/bookings', icon: UserPlus, label: 'Manual Booking' },
      { to: '/staff/pending-payments', icon: Wallet, label: 'Pending Payments' },
      { to: '/staff/checkin', icon: ScanLine, label: 'Check-in' },
    ],
  },
  {
    label: 'Park',
    items: [{ to: '/staff/lost-found', icon: PackageSearch, label: 'Lost & Found' }],
  },
]

export default function StaffLayout() {
  return <DashboardShell brandLabel="Park Staff" title="Park Staff Dashboard" sections={sections} />
}
