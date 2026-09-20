import { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, listStaffLostFound, listStaffTrips, logFoundItem, updateLostFoundStatus } from '../../lib/api'

const STATUS_TONE = {
  open: 'bg-amber-50 text-amber-700',
  claimed: 'bg-green-50 text-green-700',
  closed: 'bg-ink-500/10 text-ink-500',
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDeparture(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function LostFound() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [trips, setTrips] = useState([])
  const [description, setDescription] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [tripId, setTripId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    listStaffLostFound()
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    listStaffTrips().then(setTrips).catch(() => {})
  }, [])

  async function handleLog(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await logFoundItem({ description, contactInfo: contactInfo || undefined, tripId: tripId || undefined })
      setNotice('Found item logged.')
      setDescription('')
      setContactInfo('')
      setTripId('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatus(id, status) {
    try {
      const updated = await updateLostFoundStatus(id, status)
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <h2 className="text-sm font-bold text-ink-900">Log a Found Item</h2>
        <form onSubmit={handleLog} className="mt-3 flex flex-col gap-3">
          <textarea
            required
            rows={2}
            placeholder="Describe the item"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          />
          <input
            placeholder="Contact info left by finder (optional)"
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          />
          <select
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          >
            <option value="">No specific trip</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {formatDeparture(t.departureTime)} · {t.routeLabel}
              </option>
            ))}
          </select>
          {notice && <p className="text-sm text-green-700">{notice}</p>}
          {error && <p className="text-sm text-brand-700">{error}</p>}
          <Button type="submit" radius="lg" disabled={submitting} className="py-3">
            {submitting ? 'Logging...' : 'Log Item'}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-900">Items at Your Park</h2>
        {loading ? (
          <p className="text-center text-sm text-ink-500">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-ink-500">No items logged yet.</p>
        ) : (
          items.map((item) => (
            <Card key={item.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">{item.type}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[item.status]}`}>
                  {item.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-900">{item.description}</p>
              {item.tripLabel && <p className="mt-1 text-xs text-ink-500">{item.tripLabel}</p>}
              <p className="mt-1 text-xs text-ink-500">{formatDate(item.createdAt)}</p>
              {item.status !== 'closed' && (
                <div className="mt-2 flex gap-2">
                  {item.status !== 'claimed' && (
                    <Button
                      variant="outline"
                      radius="lg"
                      className="px-3 py-2 text-xs"
                      onClick={() => handleStatus(item.id, 'claimed')}
                    >
                      Mark Claimed
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    radius="lg"
                    className="px-3 py-2 text-xs"
                    onClick={() => handleStatus(item.id, 'closed')}
                  >
                    Close
                  </Button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
