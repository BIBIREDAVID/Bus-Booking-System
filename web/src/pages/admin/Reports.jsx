import { Fragment, useEffect, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import Card from '../../components/Card'
import {
  ApiError,
  getOccupancyReport,
  getOpenTicketsReport,
  getRatingsReport,
  getRevenueReport,
  getSegmentOccupancy,
} from '../../lib/api'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const PAYMENT_LABEL = {
  wallet: 'Wallet',
  squad: 'Squad',
  paystack: 'Paystack',
  pay_at_park: 'Pay at Park',
}

const TRIP_STATUS_STYLES = {
  scheduled: 'bg-brand-50 text-brand-700',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-ink-500/10 text-ink-500',
}

const CHART_OPTIONS = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: { y: { beginAtZero: true } },
}

function StatCard({ label, value, tone }) {
  return (
    <Card className="flex-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone ?? 'text-ink-900'}`}>{value}</p>
    </Card>
  )
}

function naira(n) {
  return `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function pct(n) {
  return `${Math.round(n * 100)}%`
}

function formatDeparture(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function occupancyTone(rate) {
  if (rate >= 0.75) return 'text-green-700'
  if (rate >= 0.4) return 'text-yellow-700'
  return 'text-brand-700'
}

function RevenueSection({ from, to }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getRevenueReport({ from: from || undefined, to: to || undefined })
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [from, to])

  if (loading) return <p className="text-sm text-ink-500">Loading revenue...</p>
  if (error) return <p className="text-sm text-brand-700">{error}</p>
  if (!report) return null

  const paymentChartData = {
    labels: report.byPaymentMethod.map((r) => PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod),
    datasets: [
      {
        label: 'Revenue',
        data: report.byPaymentMethod.map((r) => r.amount),
        backgroundColor: '#9333ea',
      },
    ],
  }

  const routeChartData = {
    labels: report.byRoute.map((r) => r.routeLabel),
    datasets: [
      {
        label: 'Revenue',
        data: report.byRoute.map((r) => r.amount),
        backgroundColor: '#2563eb',
      },
    ],
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink-900">Revenue</h2>
      <div className="flex flex-wrap gap-4">
        <StatCard label="Total Revenue" value={naira(report.totalRevenue)} tone="text-brand-600" />
        <StatCard label="Paid Bookings" value={report.bookingCount} />
        <StatCard label="Average Fare" value={naira(report.averageFare)} />
        <StatCard label="Pending (unpaid)" value={naira(report.pendingAmount)} tone="text-yellow-700" />
        <StatCard label="Cancelled" value={report.cancelledCount} tone="text-ink-500" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card className="flex-1">
          <h3 className="text-sm font-bold text-ink-900">Revenue by Payment Method</h3>
          {report.byPaymentMethod.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">No paid bookings in this range.</p>
          ) : (
            <>
              <div className="mt-3 max-w-md">
                <Bar data={paymentChartData} options={CHART_OPTIONS} />
              </div>
              <div className="mt-4 flex flex-col divide-y divide-brand-50">
                {report.byPaymentMethod.map((row) => (
                  <div key={row.paymentMethod} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {PAYMENT_LABEL[row.paymentMethod] ?? row.paymentMethod}
                      </p>
                      <p className="text-xs text-ink-500">
                        {row.count} booking{row.count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-ink-900">{naira(row.amount)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="flex-1">
          <h3 className="text-sm font-bold text-ink-900">Revenue by Route</h3>
          {report.byRoute.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">No paid bookings in this range.</p>
          ) : (
            <>
              <div className="mt-3 max-w-md">
                <Bar data={routeChartData} options={CHART_OPTIONS} />
              </div>
              <div className="mt-4 flex flex-col divide-y divide-brand-50">
                {report.byRoute.map((row) => (
                  <div key={row.routeLabel} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{row.routeLabel}</p>
                      <p className="text-xs text-ink-500">
                        {row.count} booking{row.count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-ink-900">{naira(row.amount)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

function SegmentDrilldown({ tripId }) {
  const [segments, setSegments] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSegmentOccupancy(tripId)
      .then((r) => setSegments(r.segments))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load segments'))
      .finally(() => setLoading(false))
  }, [tripId])

  if (loading) return <p className="py-2 text-xs text-ink-500">Loading segments...</p>
  if (error) return <p className="py-2 text-xs text-brand-700">{error}</p>
  if (!segments || segments.length === 0) return <p className="py-2 text-xs text-ink-500">No fare segments configured.</p>

  return (
    <div className="flex flex-col gap-1 py-2 pl-4">
      {segments.map((s) => (
        <div key={s.segmentId} className="flex items-center justify-between text-xs">
          <span className="text-ink-700">{s.segmentLabel}</span>
          <span className={`font-semibold ${occupancyTone(s.occupancyRate)}`}>
            {s.bookedSeats}/{s.totalSeats} · {pct(s.occupancyRate)}
          </span>
        </div>
      ))}
    </div>
  )
}

function OccupancySection({ from, to }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedTripId, setExpandedTripId] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getOccupancyReport({ from: from || undefined, to: to || undefined })
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [from, to])

  if (loading) return <p className="text-sm text-ink-500">Loading occupancy...</p>
  if (error) return <p className="text-sm text-brand-700">{error}</p>
  if (!report) return null

  const routeChartData = {
    labels: report.byRoute.map((r) => r.routeLabel),
    datasets: [
      {
        label: 'Occupancy %',
        data: report.byRoute.map((r) => Math.round(r.occupancyRate * 100)),
        backgroundColor: '#16a34a',
      },
    ],
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-ink-900">Occupancy</h2>
        <p className="text-xs text-ink-500">Filtered by trip departure date, not booking date.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <StatCard
          label="Overall Occupancy"
          value={pct(report.overallOccupancyRate)}
          tone={occupancyTone(report.overallOccupancyRate)}
        />
        <StatCard label="Seats Booked" value={report.totalBookedSeats} />
        <StatCard label="Total Seats" value={report.totalSeats} />
        <StatCard label="Trips" value={report.tripCount} />
      </div>

      <Card>
        <h3 className="text-sm font-bold text-ink-900">Occupancy by Route</h3>
        {report.byRoute.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No trips with a bus assigned in this range.</p>
        ) : (
          <>
            <div className="mt-3 max-w-md">
              <Bar
                data={routeChartData}
                options={{ ...CHART_OPTIONS, scales: { y: { beginAtZero: true, max: 100 } } }}
              />
            </div>
            <div className="mt-4 flex flex-col divide-y divide-brand-50">
              {report.byRoute.map((row) => (
                <div key={row.routeLabel} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{row.routeLabel}</p>
                    <p className="text-xs text-ink-500">
                      {row.bookedSeats}/{row.totalSeats} seats · {row.tripCount} trip{row.tripCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${occupancyTone(row.occupancyRate)}`}>{pct(row.occupancyRate)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-ink-900">Trips</h3>
        <p className="mt-1 text-xs text-ink-500">Click a trip to see occupancy per fare segment.</p>
        {report.trips.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No trips with a bus assigned in this range.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-xs uppercase tracking-wide text-ink-500">
                  <th className="pb-2 pr-4">Route</th>
                  <th className="pb-2 pr-4">Departure</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Seats</th>
                  <th className="pb-2">Occupancy</th>
                </tr>
              </thead>
              <tbody>
                {report.trips.map((t) => (
                  <Fragment key={t.tripId}>
                    <tr
                      className="cursor-pointer border-b border-brand-50 last:border-0 hover:bg-brand-50/40"
                      onClick={() => setExpandedTripId((id) => (id === t.tripId ? null : t.tripId))}
                    >
                      <td className="py-3 pr-4 text-ink-700">{t.routeLabel}</td>
                      <td className="py-3 pr-4 text-ink-700">{formatDeparture(t.departureTime)}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${TRIP_STATUS_STYLES[t.status]}`}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-ink-700">
                        {t.bookedSeats}/{t.totalSeats}
                      </td>
                      <td className={`py-3 font-semibold ${occupancyTone(t.occupancyRate)}`}>
                        {pct(t.occupancyRate)}
                      </td>
                    </tr>
                    {expandedTripId === t.tripId && (
                      <tr>
                        <td colSpan={5} className="bg-brand-50/30">
                          <SegmentDrilldown tripId={t.tripId} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function RatingsSection() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRatingsReport()
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-ink-500">Loading ratings...</p>
  if (error) return <p className="text-sm text-brand-700">{error}</p>
  if (!report) return null

  const driverChartData = {
    labels: report.byDriver.map((r) => r.driverName),
    datasets: [{ label: 'Avg Rating', data: report.byDriver.map((r) => r.avgRating), backgroundColor: '#f59e0b' }],
  }
  const routeChartData = {
    labels: report.byRoute.map((r) => r.routeLabel),
    datasets: [{ label: 'Avg Rating', data: report.byRoute.map((r) => r.avgRating), backgroundColor: '#f59e0b' }],
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink-900">Ratings</h2>
      <div className="flex flex-col gap-6 lg:flex-row">
        <Card className="flex-1">
          <h3 className="text-sm font-bold text-ink-900">Average Rating per Driver</h3>
          {report.byDriver.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">No rated trips with a driver assigned yet.</p>
          ) : (
            <>
              <div className="mt-3 max-w-md">
                <Bar data={driverChartData} options={{ ...CHART_OPTIONS, scales: { y: { beginAtZero: true, max: 5 } } }} />
              </div>
              <div className="mt-4 flex flex-col divide-y divide-brand-50">
                {report.byDriver.map((row) => (
                  <div key={row.driverId} className="flex items-center justify-between py-2">
                    <p className="text-sm font-semibold text-ink-900">{row.driverName}</p>
                    <p className="text-sm font-bold text-amber-600">
                      {row.avgRating.toFixed(1)}★ ({row.ratingCount})
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="flex-1">
          <h3 className="text-sm font-bold text-ink-900">Average Rating per Route</h3>
          {report.byRoute.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">No rated trips yet.</p>
          ) : (
            <>
              <div className="mt-3 max-w-md">
                <Bar data={routeChartData} options={{ ...CHART_OPTIONS, scales: { y: { beginAtZero: true, max: 5 } } }} />
              </div>
              <div className="mt-4 flex flex-col divide-y divide-brand-50">
                {report.byRoute.map((row) => (
                  <div key={row.routeId} className="flex items-center justify-between py-2">
                    <p className="text-sm font-semibold text-ink-900">{row.routeLabel}</p>
                    <p className="text-sm font-bold text-amber-600">
                      {row.avgRating.toFixed(1)}★ ({row.ratingCount})
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

function OpenTicketsSection() {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getOpenTicketsReport()
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
  }, [])

  if (error) return <p className="text-sm text-brand-700">{error}</p>
  if (!report) return <p className="text-sm text-ink-500">Loading...</p>

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink-900">Open Items</h2>
      <div className="flex flex-wrap gap-4">
        <StatCard label="Open Complaints" value={report.complaints.open} tone="text-brand-600" />
        <StatCard label="Complaints In Review" value={report.complaints.inReview} tone="text-yellow-700" />
        <StatCard label="Open Support Tickets" value={report.supportTickets.open} tone="text-brand-600" />
      </div>
    </div>
  )
}

export default function Reports() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-ink-900">Reports</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-ink-500">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-500">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
              />
            </label>
            {(from || to) && (
              <button
                type="button"
                onClick={() => {
                  setFrom('')
                  setTo('')
                }}
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          {from || to
            ? 'Applied to revenue (by booking date) and occupancy (by departure date) below.'
            : 'All-time totals — filter by date above.'}
        </p>
      </Card>

      <OpenTicketsSection />
      <RevenueSection from={from} to={to} />
      <OccupancySection from={from} to={to} />
      <RatingsSection />
    </div>
  )
}
