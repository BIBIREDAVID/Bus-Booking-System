import { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, createComplaint, listBookings, listMyComplaints } from '../../lib/api'

const CATEGORIES = [
  { v: 'driver_conduct', label: 'Driver Conduct' },
  { v: 'vehicle_condition', label: 'Vehicle Condition' },
  { v: 'delay', label: 'Delay' },
  { v: 'staff_service', label: 'Staff Service' },
  { v: 'other', label: 'Other' },
]

const STATUS_TONE = {
  open: 'bg-amber-50 text-amber-700',
  in_review: 'bg-blue-50 text-blue-700',
  resolved: 'bg-green-50 text-green-700',
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Complaints() {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [bookings, setBookings] = useState([])
  const [category, setCategory] = useState(CATEGORIES[0].v)
  const [message, setMessage] = useState('')
  const [tripId, setTripId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    listMyComplaints()
      .then(setComplaints)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    listBookings()
      .then(({ bookings }) => setBookings(bookings.filter((b) => b.status !== 'held')))
      .catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await createComplaint({ category, message, tripId: tripId || undefined })
      setNotice('Complaint submitted — our team will review it shortly.')
      setMessage('')
      setTripId('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-sm font-bold text-ink-900">File a Complaint</h2>
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.v}
                type="button"
                onClick={() => setCategory(c.v)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  category === c.v ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 text-ink-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <select
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          >
            <option value="">No specific trip</option>
            {bookings.map((b) => (
              <option key={b.bookingId} value={b.tripId}>
                {b.boardParkName} → {b.alightParkName} · {formatDate(b.departureTime)}
              </option>
            ))}
          </select>

          <textarea
            required
            rows={3}
            placeholder="Tell us what happened"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          />

          {notice && <p className="text-sm text-green-700">{notice}</p>}
          {error && <p className="text-sm text-brand-700">{error}</p>}

          <Button type="submit" radius="lg" disabled={submitting} className="py-3">
            {submitting ? 'Submitting...' : 'Submit Complaint'}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-center text-sm text-ink-500">Loading...</p>
        ) : complaints.length === 0 ? (
          <p className="text-center text-sm text-ink-500">No complaints filed yet.</p>
        ) : (
          complaints.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {c.category.replace('_', ' ')}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[c.status] ?? ''}`}>
                  {c.status.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-900">{c.message}</p>
              {c.tripLabel && <p className="mt-1 text-xs text-ink-500">{c.tripLabel}</p>}
              {c.resolutionNotes && (
                <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{c.resolutionNotes}</p>
              )}
              <p className="mt-2 text-xs text-ink-500">{formatDate(c.createdAt)}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
