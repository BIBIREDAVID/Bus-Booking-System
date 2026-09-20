import { useEffect, useState } from 'react'
import { Wallet, RefreshCw } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { ApiError, listPendingPayments, markPaid } from '../../lib/api'

function formatDeparture(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PendingPayments() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [processingId, setProcessingId] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    listPendingPayments()
      .then(setBookings)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleMarkPaid(id) {
    setProcessingId(id)
    try {
      await markPaid(id)
      setBookings((prev) => prev.filter((b) => b.id !== id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <PageHeader
        icon={Wallet}
        title="Pending Payments"
        description="Cash reservations waiting to be collected at the counter."
        actions={
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-600 shadow-sm"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error && <p className="text-sm text-brand-700">{error}</p>}

      {loading ? (
        <LoadingState />
      ) : bookings.length === 0 ? (
        <EmptyState icon={Wallet} message="No pending pay-at-park reservations." />
      ) : (
        bookings.map((b) => (
          <Card key={b.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {b.riderName ?? 'Unnamed'} · {b.riderPhone}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Seat {b.seatNumber} · {b.boardParkName} → {b.alightParkName} · {formatDeparture(b.departureTime)}
              </p>
              <p className="mt-1 text-sm font-bold text-brand-600">₦{b.amount}</p>
            </div>
            <Button
              radius="lg"
              className="shrink-0 px-4 py-2 text-xs"
              disabled={processingId === b.id}
              onClick={() => handleMarkPaid(b.id)}
            >
              {processingId === b.id ? 'Marking...' : 'Mark Paid'}
            </Button>
          </Card>
        ))
      )}
    </div>
  )
}
