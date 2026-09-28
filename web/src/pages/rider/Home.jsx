import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, listBookings, listUpcomingTrips } from '../../lib/api'
import { RatingModal } from './Bookings'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
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

function naira(n) {
  return `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function Home() {
  const navigate = useNavigate()
  const [unratedTrip, setUnratedTrip] = useState(null)
  const [rating, setRating] = useState(false)

  const [rides, setRides] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    listBookings()
      .then(({ bookings }) => {
        const unrated = bookings.find((b) => b.status === 'completed' && !b.rating)
        setUnratedTrip(unrated ?? null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    listUpcomingTrips()
      .then(({ results }) => setRides(results))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load available rides'))
  }, [])

  function selectRide(result) {
    navigate(
      `/trips/${result.tripId}/seats?board=${result.boardStopId}&alight=${result.alightStopId}` +
        `&from=${encodeURIComponent(result.originParkName)}&to=${encodeURIComponent(result.destParkName)}` +
        `&when=${encodeURIComponent(result.departureTime)}&fare=${result.fare ?? ''}`,
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {unratedTrip && (
        <Card tone="brand">
          <h3 className="text-sm font-bold">How was your trip?</h3>
          <p className="mt-1 text-xs text-white/80">
            {unratedTrip.boardParkName} → {unratedTrip.alightParkName} · {formatDate(unratedTrip.departureTime)}
          </p>
          <Button variant="light" radius="lg" className="mt-3 px-4 py-2 text-sm" onClick={() => setRating(true)}>
            Rate this Trip
          </Button>
        </Card>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-900">Available Rides</h2>
          <button type="button" onClick={() => navigate('/search')} className="text-xs font-semibold text-brand-600">
            Search by route →
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}

        {rides === null ? (
          <p className="mt-4 text-center text-sm text-ink-500">Loading...</p>
        ) : rides.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-ink-500">No upcoming rides are open for booking right now — check back soon.</p>
          </Card>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {rides.map((ride) => (
              <Card key={ride.tripId} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {ride.originParkName} → {ride.destParkName}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDeparture(ride.departureTime)}
                    {ride.bus && ` · ${ride.bus.plate} · ${ride.bus.class}`}
                  </p>
                  {ride.fare && <p className="mt-1 text-sm font-bold text-brand-600">{naira(ride.fare)}</p>}
                </div>
                <Button radius="lg" className="shrink-0 px-4 py-2 text-xs" onClick={() => selectRide(ride)}>
                  Select Seats
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {rating && unratedTrip && (
        <RatingModal
          ticket={unratedTrip}
          onClose={() => setRating(false)}
          onDone={() => {
            setRating(false)
            setUnratedTrip(null)
          }}
        />
      )}
    </div>
  )
}
