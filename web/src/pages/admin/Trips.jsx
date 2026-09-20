import { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, assignTrip, cancelTrip, listBuses, listDrivers, listTrips } from '../../lib/api'

const STATUS_STYLES = {
  scheduled: 'bg-brand-50 text-brand-700',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-ink-500/10 text-ink-500',
}

function formatDeparture(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function TripRow({ trip, buses, drivers, onChanged }) {
  const [busId, setBusId] = useState(trip.bus?.id ?? '')
  const [driverId, setDriverId] = useState(trip.driver?.id ?? '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const isCancelled = trip.status === 'cancelled'

  async function handleAssign() {
    setError(null)
    setBusy(true)
    try {
      await assignTrip(trip.id, { busId, driverId: driverId || null })
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    setError(null)
    setBusy(true)
    try {
      await cancelTrip(trip.id)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-brand-50 py-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink-900">{trip.routeLabel}</p>
          <p className="text-xs text-ink-500">
            {formatDeparture(trip.departureTime)} · {trip.seatCount} seat{trip.seatCount === 1 ? '' : 's'}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[trip.status]}`}>
          {trip.status.replace('_', ' ')}
        </span>
      </div>

      {!isCancelled && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={busId}
            onChange={(e) => setBusId(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          >
            <option value="">Select bus</option>
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.plate} ({b.capacity}, {b.class})
              </option>
            ))}
          </select>

          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          >
            <option value="">No driver</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            radius="lg"
            className="px-3 py-2 text-xs"
            disabled={busy || !busId}
            onClick={handleAssign}
          >
            Assign
          </Button>

          <Button
            variant="ghost"
            radius="lg"
            className="px-3 py-2 text-xs text-brand-700"
            disabled={busy}
            onClick={handleCancel}
          >
            Cancel trip
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-brand-700">{error}</p>}
    </div>
  )
}

export default function Trips() {
  const [trips, setTrips] = useState([])
  const [buses, setBuses] = useState([])
  const [drivers, setDrivers] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function refresh() {
    const [tripsData, busesData, driversData] = await Promise.all([
      listTrips(statusFilter ? { status: statusFilter } : undefined),
      listBuses(),
      listDrivers(),
    ])
    setTrips(tripsData)
    setBuses(busesData)
    setDrivers(driversData)
  }

  useEffect(() => {
    setLoading(true)
    refresh()
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-ink-900">Generated trips</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
        >
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}

      {loading ? (
        <p className="mt-4 text-sm text-ink-500">Loading...</p>
      ) : trips.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">
          No trips yet — create an active route schedule and run the trip-generation job.
        </p>
      ) : (
        <div className="mt-4 flex flex-col">
          {trips.map((trip) => (
            <TripRow key={trip.id} trip={trip} buses={buses} drivers={drivers} onChanged={refresh} />
          ))}
        </div>
      )}
    </Card>
  )
}
