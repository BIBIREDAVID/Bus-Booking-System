import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, getBooking } from '../../lib/api'

const STATUS_LABEL = {
  booked: 'Confirmed',
  reserved_unpaid: 'Reserved — pay at park',
  cancelled: 'Cancelled',
  completed: 'Completed',
  held: 'Pending',
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function Ticket() {
  const { bookingId } = useParams()
  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getBooking(bookingId)
      .then(({ ticket }) => setTicket(ticket))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load ticket'))
      .finally(() => setLoading(false))
  }, [bookingId])

  if (loading) return <p className="text-center text-sm text-ink-500">Loading...</p>
  if (error || !ticket) return <p className="text-center text-sm text-brand-700">{error ?? 'Ticket not found'}</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink-900">Your Ticket Is Ready</h1>
        <p className="mt-1 text-sm text-ink-500">
          {ticket.status === 'reserved_unpaid'
            ? 'Your seat is reserved. Pay at the park before your cutoff time.'
            : 'Your booking has been confirmed. Please show this QR when boarding the bus.'}
        </p>
      </div>

      <Card tone="brand">
        <div className="mx-auto flex w-full max-w-[220px] flex-col items-center rounded-2xl bg-white p-4">
          <QRCodeSVG value={ticket.bookingId} size={160} />
        </div>

        <div className="mt-5 text-center">
          <h2 className="text-lg font-bold">Journey Details</h2>
          <p className="mt-0.5 text-xs text-white/70">Booking ID: {ticket.bookingId.slice(0, 8).toUpperCase()}</p>
        </div>

        <div className="mt-4 flex justify-between text-sm">
          <div>
            <p className="text-xs text-white/70">From</p>
            <p className="font-semibold">{ticket.boardParkName}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/70">To</p>
            <p className="font-semibold">{ticket.alightParkName}</p>
          </div>
        </div>

        <div className="mt-4 flex justify-between border-t border-white/20 pt-4 text-sm">
          <div>
            <p className="text-xs text-white/70">Date</p>
            <p className="font-semibold">{formatDate(ticket.departureTime)}</p>
          </div>
          <div>
            <p className="text-xs text-white/70">Dep. Time</p>
            <p className="font-semibold">{formatTime(ticket.departureTime)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/70">Seat No.</p>
            <p className="font-semibold">{ticket.seatNumber}</p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-white/70">
          {ticket.status === 'reserved_unpaid'
            ? `Pay before ${ticket.payAtParkCutoff ? new Date(ticket.payAtParkCutoff).toLocaleString() : 'the cutoff'} or this reservation is cancelled.`
            : 'Please arrive at the boarding point 15 minutes before departure.'}
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-500">Status</span>
          <span className="font-semibold text-ink-900">{STATUS_LABEL[ticket.status] ?? ticket.status}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-ink-500">Fare</span>
          <span className="font-semibold text-ink-900">₦{ticket.amount}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-ink-500">Bus</span>
          <span className="font-semibold text-ink-900">{ticket.busPlate ?? '—'}</span>
        </div>
      </Card>

      <Button variant="outline" radius="lg" className="w-full py-3" onClick={() => window.print()}>
        Download Ticket
      </Button>
    </div>
  )
}
