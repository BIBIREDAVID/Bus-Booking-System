import { useEffect, useState } from 'react'
import Card from '../../components/Card'
import { ApiError, listMyTripAlerts } from '../../lib/api'

const TYPE_LABEL = {
  delay: 'Delay',
  route_change: 'Route Change',
  cancellation: 'Cancellation',
  holiday_notice: 'Holiday Notice',
}

const TYPE_TONE = {
  delay: 'bg-amber-50 text-amber-700',
  route_change: 'bg-blue-50 text-blue-700',
  cancellation: 'bg-brand-50 text-brand-700',
  holiday_notice: 'bg-green-50 text-green-700',
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function TravelUpdates() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    listMyTripAlerts()
      .then(setAlerts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-ink-900">Travel Updates</h1>

      {loading ? (
        <p className="text-center text-sm text-ink-500">Loading...</p>
      ) : error ? (
        <p className="text-center text-sm text-brand-700">{error}</p>
      ) : alerts.length === 0 ? (
        <p className="text-center text-sm text-ink-500">No updates for your upcoming trips.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TYPE_TONE[a.type] ?? ''}`}>
                  {TYPE_LABEL[a.type] ?? a.type}
                </span>
                <span className="text-xs text-ink-500">{formatDateTime(a.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm text-ink-900">{a.message}</p>
              <p className="mt-1 text-xs text-ink-500">{a.tripLabel ?? a.routeLabel}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
