import { useEffect, useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { ApiError, listAdminSupportTickets, resolveSupportTicket } from '../../lib/api'

const STATUS_TONE = {
  open: 'bg-amber-50 text-amber-700',
  resolved: 'bg-green-50 text-green-700',
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function Support() {
  const [tickets, setTickets] = useState([])
  const [statusFilter, setStatusFilter] = useState('open')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    listAdminSupportTickets({ status: statusFilter || undefined })
      .then(setTickets)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [statusFilter])

  async function handleResolve(id) {
    try {
      const updated = await resolveSupportTicket(id, 'resolved')
      setTickets((prev) => (statusFilter === 'open' ? prev.filter((t) => t.id !== id) : prev.map((t) => (t.id === id ? updated : t))))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader icon={LifeBuoy} title="Support Tickets" description="Payment, booking, and technical requests from riders." />
      <div className="-mt-2 flex items-center justify-end">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {error && <p className="text-sm text-brand-700">{error}</p>}

      {loading ? (
        <LoadingState />
      ) : tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} message="No tickets found." />
      ) : (
        tickets.map((t) => (
          <Card key={t.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {t.riderName ?? 'Unnamed'} · {t.riderPhone}
              </p>
              <p className="text-xs text-ink-500 uppercase tracking-wide">{t.category}</p>
              <p className="mt-1 text-sm text-ink-900">{t.message}</p>
              <p className="mt-1 text-xs text-ink-500">{formatDate(t.createdAt)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[t.status]}`}>
                {t.status}
              </span>
              {t.status === 'open' && (
                <Button radius="lg" className="px-3 py-2 text-xs" onClick={() => handleResolve(t.id)}>
                  Resolve
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
