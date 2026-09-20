import { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, createSupportTicket, listMySupportTickets } from '../../lib/api'

const CATEGORIES = [
  { v: 'payment', label: 'Payment' },
  { v: 'booking', label: 'Booking' },
  { v: 'technical', label: 'Technical' },
  { v: 'other', label: 'Other' },
]

const STATUS_TONE = {
  open: 'bg-amber-50 text-amber-700',
  resolved: 'bg-green-50 text-green-700',
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Support() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [category, setCategory] = useState(CATEGORIES[0].v)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    listMySupportTickets()
      .then(setTickets)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await createSupportTicket({ category, message })
      setNotice('Support ticket opened — we will get back to you.')
      setMessage('')
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
        <h2 className="text-sm font-bold text-ink-900">Contact Support</h2>
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
          <textarea
            required
            rows={3}
            placeholder="How can we help?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          />
          {notice && <p className="text-sm text-green-700">{notice}</p>}
          {error && <p className="text-sm text-brand-700">{error}</p>}
          <Button type="submit" radius="lg" disabled={submitting} className="py-3">
            {submitting ? 'Submitting...' : 'Open Ticket'}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-center text-sm text-ink-500">Loading...</p>
        ) : tickets.length === 0 ? (
          <p className="text-center text-sm text-ink-500">No support tickets yet.</p>
        ) : (
          tickets.map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t.category}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[t.status]}`}>
                  {t.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-900">{t.message}</p>
              <p className="mt-2 text-xs text-ink-500">{formatDate(t.createdAt)}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
