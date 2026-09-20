import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../../components/Card'
import Button from '../../components/Button'
import {
  ApiError,
  cancelBooking,
  getSeatMap,
  listBookings,
  listParks,
  rateBooking,
  rescheduleBooking,
  searchTrips,
} from '../../lib/api'

const STATUS_LABEL = {
  booked: 'Confirmed',
  reserved_unpaid: 'Reserved — pay at park',
  cancelled: 'Cancelled',
  completed: 'Completed',
  held: 'Pending',
}

const STATUS_TONE = {
  booked: 'bg-green-50 text-green-700',
  reserved_unpaid: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-ink-500/10 text-ink-500',
  completed: 'bg-ink-500/10 text-ink-700',
  held: 'bg-amber-50 text-amber-700',
}

const ONE_HOUR_MS = 60 * 60 * 1000

function naira(n) {
  return `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function isUpcoming(ticket) {
  return (
    (ticket.status === 'booked' || ticket.status === 'reserved_unpaid') &&
    new Date(ticket.departureTime).getTime() > Date.now()
  )
}

function hoursUntilDeparture(ticket) {
  return (new Date(ticket.departureTime).getTime() - Date.now()) / ONE_HOUR_MS
}

function canCancel(ticket) {
  return isUpcoming(ticket)
}

function canReschedule(ticket) {
  return ticket.status === 'booked' && isUpcoming(ticket) && hoursUntilDeparture(ticket) >= 2
}

function canRate(ticket) {
  return ticket.status === 'completed' && !ticket.rating
}

export default function Bookings() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('upcoming')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [cancellingId, setCancellingId] = useState(null)
  const [cancelNotice, setCancelNotice] = useState(null)

  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [ratingTarget, setRatingTarget] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    listBookings()
      .then(({ bookings }) => setTickets(bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load bookings'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const upcoming = useMemo(() => tickets.filter(isUpcoming), [tickets])
  const history = useMemo(() => tickets.filter((t) => !isUpcoming(t)), [tickets])
  const shown = tab === 'upcoming' ? upcoming : history

  async function handleCancel(ticket) {
    if (!window.confirm('Cancel this booking?')) return
    setCancellingId(ticket.bookingId)
    setCancelNotice(null)
    try {
      const { refunded } = await cancelBooking(ticket.bookingId)
      setCancelNotice(
        refunded
          ? 'Booking cancelled — 100% refunded to your wallet.'
          : 'Booking cancelled. No refund, as it was within 24 hours of departure.',
      )
      load()
    } catch (err) {
      setCancelNotice(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-full bg-brand-50 p-1 text-sm font-semibold">
        {['upcoming', 'history'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full py-2 capitalize transition-colors ${
              tab === t ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {cancelNotice && (
        <p className="rounded-xl bg-brand-50 px-4 py-2 text-center text-sm text-brand-700">{cancelNotice}</p>
      )}

      {loading ? (
        <p className="text-center text-sm text-ink-500">Loading...</p>
      ) : error ? (
        <p className="text-center text-sm text-brand-700">{error}</p>
      ) : shown.length === 0 ? (
        <p className="text-center text-sm text-ink-500">
          {tab === 'upcoming' ? 'No upcoming trips.' : 'No past trips yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((ticket) => (
            <Card key={ticket.bookingId}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {ticket.boardParkName} → {ticket.alightParkName}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDate(ticket.departureTime)} · {formatTime(ticket.departureTime)} · Seat{' '}
                    {ticket.seatNumber}
                  </p>
                  <p className="mt-1 text-sm font-bold text-brand-600">{naira(ticket.amount)}</p>
                  {ticket.rating && (
                    <p className="mt-1 text-xs text-amber-600">
                      {'★'.repeat(ticket.rating.stars)}
                      {'☆'.repeat(5 - ticket.rating.stars)}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[ticket.status] ?? ''}`}
                >
                  {STATUS_LABEL[ticket.status] ?? ticket.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  radius="lg"
                  className="px-4 py-2 text-xs"
                  onClick={() => navigate(`/tickets/${ticket.bookingId}`)}
                >
                  View Ticket
                </Button>
                {canReschedule(ticket) && (
                  <Button
                    variant="outline"
                    radius="lg"
                    className="px-4 py-2 text-xs"
                    onClick={() => setRescheduleTarget(ticket)}
                  >
                    Reschedule
                  </Button>
                )}
                {canRate(ticket) && (
                  <Button
                    radius="lg"
                    className="px-4 py-2 text-xs"
                    onClick={() => setRatingTarget(ticket)}
                  >
                    Rate this Trip
                  </Button>
                )}
                {canCancel(ticket) && (
                  <Button
                    variant="ghost"
                    radius="lg"
                    className="px-4 py-2 text-xs text-brand-700"
                    disabled={cancellingId === ticket.bookingId}
                    onClick={() => handleCancel(ticket)}
                  >
                    {cancellingId === ticket.bookingId ? 'Cancelling...' : 'Cancel'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {rescheduleTarget && (
        <RescheduleModal
          ticket={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onDone={() => {
            setRescheduleTarget(null)
            load()
          }}
        />
      )}

      {ratingTarget && (
        <RatingModal
          ticket={ratingTarget}
          onClose={() => setRatingTarget(null)}
          onDone={() => {
            setRatingTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}

export function RatingModal({ ticket, onClose, onDone }) {
  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await rateBooking(ticket.bookingId, { stars, comment: comment.trim() || undefined })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">Rate Your Trip</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-500">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          {ticket.boardParkName} → {ticket.alightParkName} · {formatDate(ticket.departureTime)}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="flex justify-center gap-2 text-3xl">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStars(n)}
                className={n <= stars ? 'text-amber-500' : 'text-ink-500/20'}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            placeholder="Anything you'd like to share about the trip? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          />
          {error && <p className="text-sm text-brand-700">{error}</p>}
          <Button type="submit" radius="lg" disabled={submitting} className="py-3">
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </Button>
        </form>
      </div>
    </div>
  )
}

function RescheduleModal({ ticket, onClose, onDone }) {
  const [step, setStep] = useState('date') // date -> trips -> seats
  const [parks, setParks] = useState([])
  const [date, setDate] = useState(todayISO())
  const [results, setResults] = useState([])
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [seats, setSeats] = useState(null)
  const [selectedSeatId, setSelectedSeatId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    listParks()
      .then(setParks)
      .catch(() => {})
  }, [])

  const originPark = parks.find((p) => p.name === ticket.boardParkName)
  const destPark = parks.find((p) => p.name === ticket.alightParkName)

  async function handleSearch(e) {
    e?.preventDefault()
    if (!originPark || !destPark) {
      setError('Could not resolve boarding/drop-off points. Try again shortly.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { results } = await searchTrips({ originParkId: originPark.id, destParkId: destPark.id, date })
      setResults(results.filter((r) => r.tripId !== ticket.bookingId))
      setStep('trips')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectTrip(result) {
    setSelectedTrip(result)
    setSelectedSeatId(null)
    setLoading(true)
    setError(null)
    try {
      const { seats } = await getSeatMap(result.tripId, result.boardStopId, result.alightStopId)
      setSeats(seats)
      setStep('seats')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load seats')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!selectedSeatId || !selectedTrip) return
    setLoading(true)
    setError(null)
    try {
      await rescheduleBooking(ticket.bookingId, {
        tripId: selectedTrip.tripId,
        seatId: selectedSeatId,
        boardStopId: selectedTrip.boardStopId,
        alightStopId: selectedTrip.alightStopId,
      })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">Reschedule Booking</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-500">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          {ticket.boardParkName} → {ticket.alightParkName} · currently {formatDate(ticket.departureTime)}
        </p>

        {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}

        {step === 'date' && (
          <form onSubmit={handleSearch} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-500">New travel date</span>
              <input
                type="date"
                required
                min={todayISO()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
              />
            </label>
            <Button type="submit" radius="lg" disabled={loading} className="py-3">
              {loading ? 'Searching...' : 'Find Trips'}
            </Button>
          </form>
        )}

        {step === 'trips' && (
          <div className="mt-4 flex flex-col gap-3">
            {results.length === 0 ? (
              <p className="text-center text-sm text-ink-500">No other trips found for that date.</p>
            ) : (
              results.map((result) => (
                <button
                  key={result.tripId}
                  type="button"
                  onClick={() => handleSelectTrip(result)}
                  className="flex items-center justify-between rounded-xl border border-brand-100 px-4 py-3 text-left hover:border-brand-400"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{formatTime(result.departureTime)}</p>
                    <p className="text-xs text-ink-500">
                      {formatDate(result.departureTime)}
                      {result.bus && ` · ${result.bus.plate} · ${result.bus.class}`}
                    </p>
                  </div>
                  {result.fare && <p className="text-sm font-bold text-brand-600">{naira(result.fare)}</p>}
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => setStep('date')}
              className="text-center text-xs font-semibold text-ink-500"
            >
              ← Change date
            </button>
          </div>
        )}

        {step === 'seats' && (
          <div className="mt-4 flex flex-col gap-3">
            {loading && !seats ? (
              <p className="text-center text-sm text-ink-500">Loading seats...</p>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {(seats ?? []).map((seat) => {
                  const isSelected = seat.id === selectedSeatId
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={!seat.available}
                      onClick={() => setSelectedSeatId(seat.id)}
                      className={`h-12 rounded-lg text-sm font-semibold transition-colors ${
                        isSelected
                          ? 'bg-brand-600 text-white'
                          : seat.available
                            ? 'border border-brand-200 text-ink-900 hover:border-brand-400'
                            : 'cursor-not-allowed bg-ink-500/10 text-ink-500/50'
                      }`}
                    >
                      {seat.seatNumber}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('trips')}
                className="flex-1 text-center text-xs font-semibold text-ink-500"
              >
                ← Change trip
              </button>
              <Button
                radius="lg"
                className="flex-[2] py-3 text-sm"
                disabled={!selectedSeatId || loading}
                onClick={handleConfirm}
              >
                {loading ? 'Rescheduling...' : 'Confirm Reschedule'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
