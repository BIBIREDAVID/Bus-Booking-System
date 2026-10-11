import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Route as RouteIcon } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { ApiError, listDriverTrips } from '../../lib/api'

function formatDeparture(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATUS_TONE = {
  scheduled: 'bg-brand-50 text-brand-700',
  in_progress: 'bg-amber-50 text-amber-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-ink-100 text-ink-500',
}

export default function MyTrips() {
  const navigate = useNavigate()
  const [trips, setTrips] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    listDriverTrips()
      .then(setTrips)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load trips'))
  }, [])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader icon={RouteIcon} title="My Trips" description="Your assigned trips, soonest first." />

      {error && <p className="text-sm text-brand-700">{error}</p>}

      {trips === null ? (
        <LoadingState />
      ) : trips.length === 0 ? (
        <EmptyState icon={RouteIcon} message="No trips assigned to you yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {trips.map((trip) => (
            <Card key={trip.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink-900">{trip.routeLabel}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {formatDeparture(trip.departureTime)}
                  {trip.bus && ` · ${trip.bus.plate}`}
                </p>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[trip.status] ?? ''}`}>
                  {trip.status.replace('_', ' ')}
                </span>
              </div>
              <Button radius="lg" className="shrink-0 px-4 py-2 text-xs" onClick={() => navigate(`/driver/trips/${trip.id}/manifest`)}>
                View Manifest
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
