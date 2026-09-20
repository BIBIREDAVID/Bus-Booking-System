import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, getSeatMap, holdSeat } from '../../lib/api'

function formatDeparture(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Lays seats out 2 + aisle + 2, matching the reference seat-grid style.
function seatLayout(seats) {
  const rows = []
  for (let i = 0; i < seats.length; i += 4) {
    rows.push(seats.slice(i, i + 4))
  }
  return rows
}

export default function SeatMap() {
  const { tripId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const boardStopId = searchParams.get('board')
  const alightStopId = searchParams.get('alight')
  const fromName = searchParams.get('from')
  const toName = searchParams.get('to')
  const when = searchParams.get('when')
  const fare = searchParams.get('fare')

  const [seats, setSeats] = useState(null)
  const [selectedSeatId, setSelectedSeatId] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [holding, setHolding] = useState(false)

  useEffect(() => {
    getSeatMap(tripId, boardStopId, alightStopId)
      .then(({ seats }) => setSeats(seats))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load seat map'))
      .finally(() => setLoading(false))
  }, [tripId, boardStopId, alightStopId])

  async function handleConfirm() {
    if (!selectedSeatId) return
    setError(null)
    setHolding(true)
    try {
      const result = await holdSeat({ tripId, seatId: selectedSeatId, boardStopId, alightStopId })
      const seatNumber = seats.find((s) => s.id === selectedSeatId)?.seatNumber ?? ''
      navigate(
        `/checkout?holdId=${result.holdId}&expiresAt=${encodeURIComponent(result.expiresAt)}` +
          `&from=${encodeURIComponent(fromName ?? '')}&to=${encodeURIComponent(toName ?? '')}` +
          `&when=${encodeURIComponent(when ?? '')}&fare=${fare ?? ''}&seatNumber=${seatNumber}`,
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      if (err instanceof ApiError && err.status === 409) {
        // Someone else took it — refresh availability so the grid reflects reality.
        getSeatMap(tripId, boardStopId, alightStopId).then(({ seats }) => setSeats(seats))
        setSelectedSeatId(null)
      }
    } finally {
      setHolding(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-lg font-bold text-ink-900">
          {fromName} → {toName}
        </h2>
        <p className="mt-1 text-xs text-ink-500">{formatDeparture(when)}</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink-900">Select Your Seat</h3>
          <div className="flex gap-3 text-xs text-ink-500">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-ink-500/20" /> Booked
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-brand-600" /> Your Seat
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-brand-200" /> Available
            </span>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-ink-500">Loading...</p>
        ) : error && !seats ? (
          <p className="mt-4 text-sm text-brand-700">{error}</p>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {seatLayout(seats ?? []).map((row, i) => (
              <div key={i} className="grid grid-cols-4 gap-3">
                {row.map((seat, colIndex) => {
                  const isSelected = seat.id === selectedSeatId
                  const isAisleGap = colIndex === 2
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={!seat.available}
                      onClick={() => setSelectedSeatId(seat.id)}
                      className={`h-12 rounded-lg text-sm font-semibold transition-colors ${isAisleGap ? 'ml-3' : ''} ${
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
            ))}
          </div>
        )}
      </Card>

      {error && <p className="text-center text-sm text-brand-700">{error}</p>}

      <div className="sticky bottom-4 flex items-center justify-between rounded-2xl bg-white p-4 shadow-lg">
        <div>
          <p className="text-xs text-ink-500">Total</p>
          <p className="text-lg font-bold text-ink-900">{fare ? `₦${fare}` : '—'}</p>
        </div>
        <Button radius="lg" disabled={!selectedSeatId || holding} className="px-6 py-3" onClick={handleConfirm}>
          {holding ? 'Holding...' : 'Confirm Your Selection'}
        </Button>
      </div>
    </div>
  )
}
