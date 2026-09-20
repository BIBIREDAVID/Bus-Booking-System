import { useEffect, useState } from 'react'
import { Ticket } from 'lucide-react'
import Card from '../../components/Card'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { ApiError, listAdminBookings } from '../../lib/api'

const STATUS_STYLES = {
  booked: 'bg-green-50 text-green-700',
  reserved_unpaid: 'bg-brand-50 text-brand-700',
  held: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-ink-500/10 text-ink-500',
  completed: 'bg-green-50 text-green-700',
}

const PAYMENT_LABEL = {
  wallet: 'Wallet',
  squad: 'Squad',
  paystack: 'Paystack',
  pay_at_park: 'Pay at Park',
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Bookings() {
  const [bookings, setBookings] = useState([])
  const [status, setStatus] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      listAdminBookings({ status: status || undefined, paymentMethod: paymentMethod || undefined, phone: phone || undefined })
        .then(setBookings)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
        .finally(() => setLoading(false))
    }, 250) // debounce the phone filter
    return () => clearTimeout(timer)
  }, [status, paymentMethod, phone])

  return (
    <div>
      <PageHeader icon={Ticket} title="Bookings" description="Every booking across every route, searchable by rider." />
      <Card>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          >
            <option value="">All statuses</option>
            <option value="booked">Booked</option>
            <option value="reserved_unpaid">Reserved (unpaid)</option>
            <option value="held">Held</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          >
            <option value="">All payment methods</option>
            <option value="wallet">Wallet</option>
            <option value="squad">Squad</option>
            <option value="paystack">Paystack</option>
            <option value="pay_at_park">Pay at Park</option>
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}

      {loading ? (
        <LoadingState />
      ) : bookings.length === 0 ? (
        <EmptyState icon={Ticket} message="No bookings match these filters." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-xs uppercase tracking-wide text-ink-500">
                <th className="pb-2 pr-4">Rider</th>
                <th className="pb-2 pr-4">Route</th>
                <th className="pb-2 pr-4">Seat</th>
                <th className="pb-2 pr-4">Departure</th>
                <th className="pb-2 pr-4">Payment</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Booked</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b border-brand-50 last:border-0">
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-ink-900">{b.riderName ?? '—'}</p>
                    <p className="text-xs text-ink-500">{b.riderPhone}</p>
                  </td>
                  <td className="py-3 pr-4 text-ink-700">
                    {b.boardParkName} → {b.alightParkName}
                  </td>
                  <td className="py-3 pr-4 text-ink-700">
                    {b.seatNumber} <span className="text-xs text-ink-500">({b.class})</span>
                  </td>
                  <td className="py-3 pr-4 text-ink-700">{formatDate(b.departureTime)}</td>
                  <td className="py-3 pr-4 text-ink-700">{PAYMENT_LABEL[b.paymentMethod]}</td>
                  <td className="py-3 pr-4 font-semibold text-ink-900">₦{b.amount}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLES[b.status]}`}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-ink-500">{formatDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </Card>
    </div>
  )
}
