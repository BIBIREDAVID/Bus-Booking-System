import { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, listBookings, listLostFound, reportLostItem } from '../../lib/api'

const STATUS_TONE = {
  open: 'bg-amber-50 text-amber-700',
  claimed: 'bg-green-50 text-green-700',
  closed: 'bg-ink-500/10 text-ink-500',
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LostFound() {
  const [tab, setTab] = useState('browse') // 'browse' | 'report' | 'mine'

  const [query, setQuery] = useState('')
  const [date, setDate] = useState('')
  const [foundItems, setFoundItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [mineItems, setMineItems] = useState([])

  const [bookings, setBookings] = useState([])
  const [description, setDescription] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [tripId, setTripId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)

  function search() {
    setLoading(true)
    setError(null)
    listLostFound({ type: 'found', query: query || undefined, date: date || undefined })
      .then(setFoundItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to search'))
      .finally(() => setLoading(false))
  }

  function loadMine() {
    setLoading(true)
    setError(null)
    listLostFound({ mine: true })
      .then(setMineItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    search()
    listBookings()
      .then(({ bookings }) => setBookings(bookings.filter((b) => b.status !== 'held')))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tab === 'mine') loadMine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleReport(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await reportLostItem({ description, contactInfo: contactInfo || undefined, tripId: tripId || undefined })
      setNotice('Lost item reported — park staff will be notified.')
      setDescription('')
      setContactInfo('')
      setTripId('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-full bg-brand-50 p-1 text-sm font-semibold">
        {[
          { v: 'browse', label: 'Browse Found' },
          { v: 'report', label: 'Report Lost' },
          { v: 'mine', label: 'My Reports' },
        ].map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setTab(t.v)}
            className={`flex-1 rounded-full py-2 text-xs transition-colors ${
              tab === t.v ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-center text-sm text-brand-700">{error}</p>}

      {tab === 'browse' && (
        <>
          <Card>
            <div className="flex flex-col gap-2">
              <input
                placeholder="Search by description (e.g. backpack, phone)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1 rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
                />
                <Button radius="lg" className="px-4 py-2 text-sm" onClick={search} disabled={loading}>
                  {loading ? '...' : 'Search'}
                </Button>
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-3">
            {loading ? (
              <p className="text-center text-sm text-ink-500">Loading...</p>
            ) : foundItems.length === 0 ? (
              <p className="text-center text-sm text-ink-500">No found items match your search.</p>
            ) : (
              foundItems.map((item) => (
                <Card key={item.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink-500">{item.parkName ?? 'Unknown park'}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-900">{item.description}</p>
                  {item.tripLabel && <p className="mt-1 text-xs text-ink-500">{item.tripLabel}</p>}
                  <p className="mt-2 text-xs text-ink-500">{formatDate(item.createdAt)}</p>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'report' && (
        <Card>
          <h2 className="text-sm font-bold text-ink-900">Report a Lost Item</h2>
          <form onSubmit={handleReport} className="mt-3 flex flex-col gap-3">
            <textarea
              required
              rows={3}
              placeholder="Describe the item you lost"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
            />
            <input
              placeholder="Contact info (phone/email)"
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
              {bookings.map((b) => (
                <option key={b.bookingId} value={b.tripId}>
                  {b.boardParkName} → {b.alightParkName} · {formatDate(b.departureTime)}
                </option>
              ))}
            </select>
            {notice && <p className="text-sm text-green-700">{notice}</p>}
            <Button type="submit" radius="lg" disabled={submitting} className="py-3">
              {submitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </form>
        </Card>
      )}

      {tab === 'mine' && (
        <div className="flex flex-col gap-3">
          {loading ? (
            <p className="text-center text-sm text-ink-500">Loading...</p>
          ) : mineItems.length === 0 ? (
            <p className="text-center text-sm text-ink-500">You haven't reported any lost items.</p>
          ) : (
            mineItems.map((item) => (
              <Card key={item.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-500">Lost item</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[item.status]}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-900">{item.description}</p>
                {item.tripLabel && <p className="mt-1 text-xs text-ink-500">{item.tripLabel}</p>}
                <p className="mt-2 text-xs text-ink-500">{formatDate(item.createdAt)}</p>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
