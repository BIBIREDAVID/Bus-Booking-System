import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { ApiError, createTripAlert, listAdminTripAlerts, listRoutes, listTrips } from '../../lib/api'

const TYPE_LABEL = {
  delay: 'Delay',
  route_change: 'Route Change',
  cancellation: 'Cancellation',
  holiday_notice: 'Holiday Notice',
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [trips, setTrips] = useState([])
  const [routes, setRoutes] = useState([])
  const [target, setTarget] = useState('trip') // 'trip' | 'route'
  const [type, setType] = useState('delay')
  const [tripId, setTripId] = useState('')
  const [routeId, setRouteId] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    listAdminTripAlerts()
      .then(setAlerts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    listTrips({ status: 'scheduled' }).then(setTrips).catch(() => {})
    listRoutes().then(setRoutes).catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      const { notifiedCount } = await createTripAlert({
        type,
        message,
        ...(target === 'trip' ? { tripId } : { routeId }),
      })
      setNotice(`Alert posted — notified ${notifiedCount} rider(s).`)
      setMessage('')
      setTripId('')
      setRouteId('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader icon={Megaphone} title="Travel Alerts" description="Post delay, route change, cancellation, or holiday notices." />
      <Card>
        <h2 className="text-sm font-bold text-ink-900">Post a Travel Alert</h2>
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          <div className="flex gap-2">
            {Object.entries(TYPE_LABEL).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setType(v)}
                className={`flex-1 rounded-xl border px-2 py-2 text-xs font-semibold ${
                  type === v ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 text-ink-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTarget('trip')}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${
                target === 'trip' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 text-ink-700'
              }`}
            >
              Specific Trip
            </button>
            <button
              type="button"
              onClick={() => setTarget('route')}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${
                target === 'route' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 text-ink-700'
              }`}
            >
              Whole Route
            </button>
          </div>

          {target === 'trip' ? (
            <select
              required
              value={tripId}
              onChange={(e) => setTripId(e.target.value)}
              className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
            >
              <option value="">Select a trip</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatDateTime(t.departureTime)} · {t.routeLabel}
                </option>
              ))}
            </select>
          ) : (
            <select
              required
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
            >
              <option value="">Select a route</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          )}

          <textarea
            required
            rows={3}
            placeholder="Alert message shown to affected riders"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          />

          {notice && <p className="text-sm text-green-700">{notice}</p>}
          {error && <p className="text-sm text-brand-700">{error}</p>}

          <Button type="submit" radius="lg" disabled={submitting} className="py-3">
            {submitting ? 'Posting...' : 'Post Alert'}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-ink-900">Recent Alerts</h2>
        {loading ? (
          <LoadingState />
        ) : alerts.length === 0 ? (
          <EmptyState icon={Megaphone} message="No alerts posted yet." />
        ) : (
          <div className="mt-3 flex flex-col divide-y divide-brand-50">
            {alerts.map((a) => (
              <div key={a.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                    {TYPE_LABEL[a.type] ?? a.type}
                  </span>
                  <span className="text-xs text-ink-500">{formatDateTime(a.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-900">{a.message}</p>
                <p className="mt-1 text-xs text-ink-500">{a.tripLabel ?? a.routeLabel}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
