import { useNavigate } from 'react-router-dom'
import { Bus, ClipboardList, Car, ShieldCheck } from 'lucide-react'

const ROLES = [
  { role: 'rider', label: 'Rider', description: 'Book trips, manage your wallet and tickets', icon: Bus },
  { role: 'staff', label: 'Park Staff', description: 'Counter bookings, check-in, manifest', icon: ClipboardList },
  { role: 'driver', label: 'Driver', description: 'See your assigned trips and manifest', icon: Car },
  { role: 'admin', label: 'Admin', description: 'Run the network, fleet, and reports', icon: ShieldCheck },
]

export default function RoleSelect() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-10">
      <div className="flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl text-white">🚌</div>
        <h1 className="mt-4 text-xl font-bold text-ink-900">Sign in to BookMyBus</h1>
        <p className="mt-1 text-center text-sm text-ink-500">Choose how you're using the app</p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {ROLES.map(({ role, label, description, icon: Icon }) => (
          <button
            key={role}
            type="button"
            onClick={() => navigate(`/login/${role}`)}
            className="flex items-center gap-4 rounded-2xl border border-brand-100 p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/60"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icon size={20} strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-bold text-ink-900">{label}</p>
              <p className="text-xs text-ink-500">{description}</p>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-auto pt-10 text-center text-sm text-ink-500">
        New rider?{' '}
        <button type="button" onClick={() => navigate('/register')} className="font-semibold text-brand-600">
          Create an account
        </button>
      </p>
    </div>
  )
}
