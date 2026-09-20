import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { ApiError, getManifest, listStaffTrips } from '../../lib/api'

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

export default function Manifest() {
  const [trips, setTrips] = useState([])
  const [tripId, setTripId] = useState('')
  const [manifest, setManifest] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    listStaffTrips().then((t) => {
      setTrips(t)
      if (t.length > 0) setTripId(t[0].id)
    })
  }, [])

  function load(id) {
    if (!id) return
    setLoading(true)
    setError(null)
    getManifest(id)
      .then(setManifest)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load manifest'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(tripId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="no-print">
        <PageHeader icon={ClipboardList} title="Manifest" description="Live passenger list, sorted by seat." />
      </div>

      <Card className="no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2">
            <span className="text-xs font-semibold text-ink-500">Trip</span>
            <select
              value={tripId}
              onChange={(e) => setTripId(e.target.value)}
              className="flex-1 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatDeparture(t.departureTime)} · {t.routeLabel}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => load(tripId)} className="text-xs font-semibold text-brand-600">
              Refresh
            </button>
            <Button
              variant="outline"
              radius="lg"
              className="px-4 py-2 text-xs"
              disabled={!manifest}
              onClick={() => window.print()}
            >
              Print
            </Button>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-brand-700">{error}</p>}

      {loading ? (
        <LoadingState />
      ) : trips.length === 0 ? (
        <EmptyState icon={ClipboardList} message="No upcoming trips scheduled from your park." />
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
                  <th className="py-2 pr-2">Phone</th>
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
                    <td className="py-2 pr-2">{p.passengerPhone}</td>
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
