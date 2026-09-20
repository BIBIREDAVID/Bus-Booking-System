import { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { health, listBookings } from '../../lib/api'
import { RatingModal } from './Bookings'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Home() {
  const [status, setStatus] = useState('checking...')
  const [unratedTrip, setUnratedTrip] = useState(null)
  const [rating, setRating] = useState(false)

  useEffect(() => {
    health()
      .then((res) => setStatus(`API says: ${res.status} (${res.time})`))
      .catch(() => setStatus('Could not reach the API — is it running on :4000?'))
  }, [])

  useEffect(() => {
    listBookings()
      .then(({ bookings }) => {
        const unrated = bookings.find((b) => b.status === 'completed' && !b.rating)
        setUnratedTrip(unrated ?? null)
      })
      .catch(() => {})
  }, [])

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

      <Card>
        <h2 className="text-xl font-bold text-ink-900">Home</h2>
        <p className="mt-2 text-sm text-ink-500">Search buses, promotions, and quick actions land here.</p>
        <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">{status}</p>
      </Card>

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
