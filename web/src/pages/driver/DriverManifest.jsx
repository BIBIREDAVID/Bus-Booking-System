import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import Card from '../../components/Card'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { ApiError, getDriverManifest } from '../../lib/api'

function formatDeparture(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATUS_LABEL = {
  booked: 'Paid',
  reserved_unpaid: 'Pay at Park',
  completed: 'Completed',
}

const STATUS_TONE = {
  booked: 'bg-green-50 text-green-700',
  reserved_unpaid: 'bg-amber-50 text-amber-700',
  completed: 'bg-blue-50 text-blue-700',
}

export default function DriverManifest() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDriverManifest(tripId)
      .then(setManifest)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load manifest'))
  }, [tripId])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader icon={ClipboardList} title="Manifest" description="Passenger list for this trip, sorted by seat." />

      <button type="button" onClick={() => navigate('/driver')} className="self-start text-xs font-semibold text-brand-600">
        ← Back to My Trips
      </button>

      {error && <p className="text-sm text-brand-700">{error}</p>}

      {!manifest && !error ? (
        <LoadingState />
      ) : manifest ? (
        <Card>
          <div className="mb-3">
            <h2 className="text-base font-bold text-ink-900">{manifest.trip.routeLabel}</h2>
            <p className="text-xs text-ink-500">
              {formatDeparture(manifest.trip.departureTime)}
              {manifest.trip.busPlate && ` · ${manifest.trip.busPlate}`} · {manifest.passengers.length} passengers
            </p>
          </div>

          {manifest.passengers.length === 0 ? (
            <EmptyState icon={ClipboardList} message="No bookings yet for this trip." />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-left text-xs font-semibold uppercase text-ink-500">
                  <th className="py-2 pr-2">Seat</th>
                  <th className="py-2 pr-2">Passenger</th>
                  <th className="py-2 pr-2">Segment</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2">Boarded</th>
                </tr>
              </thead>
              <tbody>
                {manifest.passengers.map((p) => (
                  <tr key={p.bookingId} className="border-b border-brand-50">
                    <td className="py-2 pr-2 font-semibold text-ink-900">{p.seatNumber}</td>
                    <td className="py-2 pr-2">{p.passengerName ?? 'Unnamed'}</td>
                    <td className="py-2 pr-2">{p.segment}</td>
                    <td className="py-2 pr-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[p.status] ?? ''}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="py-2">
                      {p.boarded ? (
                        <span className="font-semibold text-green-700">✓ Boarded</span>
                      ) : (
                        <span className="text-ink-500/60">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}
    </div>
  )
}
