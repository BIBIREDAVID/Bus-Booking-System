import { Route as RouteIcon } from 'lucide-react'
import DashboardShell from '../../components/DashboardShell'

const sections = [
  {
    items: [{ to: '/driver', end: true, icon: RouteIcon, label: 'My Trips' }],
  },
]

export default function DriverLayout() {
  return <DashboardShell brandLabel="Driver" title="Driver Portal" sections={sections} />
}
