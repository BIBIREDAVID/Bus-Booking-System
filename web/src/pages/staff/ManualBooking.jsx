import { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, getSeatMap, listParks, listStaffTrips, manualBooking, searchTrips } from '../../lib/api'

function formatDeparture(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ManualBooking() {
  const [trips, setTrips] = useState([])
  const [tripId, setTripId] = useState('')
  const [parks, setParks] = useState([])
  const [alightStopId, setAlightStopId] = useState('')

  const [seats, setSeats] = useState(null)
  const [selectedSeatId, setSelectedSeatId] = useState(null)
  const [seatsLoading, setSeatsLoading] = useState(false)

  const [passengerName, setPassengerName] = useState('')
  const [passengerPhone, setPassengerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('pay_at_park')

  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmedTicket, setConfirmedTicket] = useState(null)

  // A trip only carries routeLabel text, not the route's stop ids —
  // fetch destination parks generically and let staff pick the
  // drop-off; alightStopId gets resolved against the trip's route via
  // seat-map's own validation (resolveSegment), so an invalid pick
  // just surfaces as a normal 400 rather than silently misbooking.
  useEffect(() => {
    listStaffTrips().then(setTrips).catch(() => {})
    listParks().then(setParks).catch(() => {})
  }, [])

  const selectedTrip = trips.find((t) => t.id === tripId)

  // The board stop is always the staff member's own park (server-
  // enforced too) — resolved as "the boarding-enabled stop matching
  // the first leg of the trip's route label" isn't available from
  // /staff/trips directly, so we ask the seat-map endpoint once we
  // know both stops. To find boardStopId + alightStopId ids we reuse
  // the origin/dest naming already present in routeLabel and match
  // against /parks + a lightweight lookup once a trip is picked.
  const [boardStopId, setBoardStopId] = useState('')

  useEffect(() => {
    setBoardStopId('')
    setAlightStopId('')
    setSeats(null)
    setSelectedSeatId(null)
  }, [tripId])

  useEffect(() => {
    if (!selectedTrip || parks.length === 0) return
    const [originName, destName] = selectedTrip.routeLabel.split(' → ')
    const originPark = parks.find((p) => p.name === originName)
    const destPark = parks.find((p) => p.name === destName)
    if (!originPark || !destPark) return
    // originPark IS the staff member's own park for every trip
    // /staff/trips returns — ask the search endpoint for this route's
    // boarding-stop ids for the trip's date.
    const dateStr = new Date(selectedTrip.departureTime).toISOString().slice(0, 10)
    searchTrips({ originParkId: originPark.id, destParkId: destPark.id, date: dateStr })
      .then(({ results }) => {
        const match = results.find((r) => r.tripId === tripId)
        if (match) {
          setBoardStopId(match.boardStopId)
          setAlightStopId(match.alightStopId)
        }
      })
      .catch(() => {})
  }, [selectedTrip, parks, tripId])

  useEffect(() => {
    if (!tripId || !boardStopId || !alightStopId) return
    setSeatsLoading(true)
    setSelectedSeatId(null)
    getSeatMap(tripId, boardStopId, alightStopId)
      .then(({ seats }) => setSeats(seats))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load seats'))
      .finally(() => setSeatsLoading(false))
  }, [tripId, boardStopId, alightStopId])

  async function handleConfirm(e) {
    e.preventDefault()
    if (!selectedSeatId) return
    setError(null)
    setSubmitting(true)
    try {
      const { ticket } = await manualBooking({
        tripId,
        seatId: selectedSeatId,
        boardStopId,
        alightStopId,
        passengerName,
        passengerPhone,
        paymentMethod,
      })
      setConfirmedTicket(ticket)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setConfirmedTicket(null)
    setTripId('')
    setPassengerName('')
    setPassengerPhone('')
    setPaymentMethod('pay_at_park')
    setError(null)
    listStaffTrips().then(setTrips).catch(() => {})
  }

  if (confirmedTicket) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-2xl text-green-600">
          ✓
        </div>
        <h2 className="mt-3 text-lg font-bold text-ink-900">Booking Confirmed</h2>
        <p className="mt-1 text-sm text-ink-500">
          Seat {confirmedTicket.seatNumber} · {confirmedTicket.boardParkName} → {confirmedTicket.alightParkName}
        </p>
        <p className="mt-1 text-sm font-bold text-brand-600">
          ₦{confirmedTicket.amount} ·{' '}
          {confirmedTicket.status === 'reserved_unpaid' ? 'Collect cash at boarding' : 'Paid'}
        </p>
        <Button radius="lg" className="mt-4 w-full py-3" onClick={reset}>
          New Booking
        </Button>
      </Card>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <h2 className="text-sm font-bold text-ink-900">1. Select Trip</h2>
        <select
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          className="mt-2 w-full rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        >
          <option value="">Select a departing trip</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {formatDeparture(t.departureTime)} · {t.routeLabel} {t.bus ? `· ${t.bus.plate}` : ''}
            </option>
          ))}
        </select>
        {trips.length === 0 && (
          <p className="mt-2 text-xs text-ink-500">No upcoming trips scheduled from your park.</p>
        )}
      </Card>

      {tripId && (
        <Card>
          <h2 className="text-sm font-bold text-ink-900">2. Select Seat</h2>
          {seatsLoading || !boardStopId ? (
            <p className="mt-3 text-sm text-ink-500">Loading seats...</p>
          ) : (
            <div className="mt-3 grid grid-cols-6 gap-2">
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
        </Card>
      )}

      {tripId && selectedSeatId && (
        <Card>
          <h2 className="text-sm font-bold text-ink-900">3. Passenger Details</h2>
          <form onSubmit={handleConfirm} className="mt-3 flex flex-col gap-3">
            <input
              required
              placeholder="Passenger name"
              value={passengerName}
              onChange={(e) => setPassengerName(e.target.value)}
              className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
            />
            <input
              required
              placeholder="Phone (e.g. +2348012345678)"
              value={passengerPhone}
              onChange={(e) => setPassengerPhone(e.target.value)}
              className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
            />
            <div className="flex gap-2">
              {[
                { v: 'pay_at_park', label: 'Pay at Park (cash)' },
                { v: 'wallet', label: "Passenger's Wallet" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setPaymentMethod(opt.v)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${
                    paymentMethod === opt.v
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-brand-100 text-ink-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-brand-700">{error}</p>}
            <Button type="submit" radius="lg" disabled={submitting} className="py-3">
              {submitting ? 'Booking...' : 'Confirm Booking'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}
