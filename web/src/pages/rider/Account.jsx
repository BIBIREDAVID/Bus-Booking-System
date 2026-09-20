import { useNavigate } from 'react-router-dom'
import Card from '../../components/Card'
import { useAuth } from '../../lib/AuthContext'

export default function Account() {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-lg font-bold text-ink-900">{user?.name ?? 'Rider'}</h2>
        <p className="mt-1 text-sm text-ink-500">{user?.phone}</p>
      </Card>

      {[
        { to: '/wallet', title: 'Wallet', description: 'Balance, top-ups, and transaction history' },
        { to: '/updates', title: 'Travel Updates', description: 'Delays, route changes, and holiday notices' },
        { to: '/complaints', title: 'Complaints', description: 'File and track ride complaints' },
        { to: '/lost-found', title: 'Lost & Found', description: 'Report a lost item or browse found items' },
        { to: '/support', title: 'Support', description: 'Payment, booking, and technical help' },
      ].map((item) => (
        <button
          key={item.to}
          type="button"
          onClick={() => navigate(item.to)}
          className="flex items-center justify-between rounded-2xl bg-white p-5 text-left shadow-[0_8px_24px_-12px_rgba(28,22,32,0.18)]"
        >
          <div>
            <p className="text-sm font-semibold text-ink-900">{item.title}</p>
            <p className="mt-0.5 text-xs text-ink-500">{item.description}</p>
          </div>
          <span className="text-brand-600">›</span>
        </button>
      ))}
    </div>
  )
}
