import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import {
  ApiError,
  createRouteSchedule,
  deleteRouteSchedule,
  listRouteSchedules,
  listRoutes,
  updateRouteSchedule,
} from '../../lib/api'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function emptyForm() {
  return { routeId: '', departureTime: '06:00', daysOfWeek: [] }
}

export default function Schedules() {
  const [routes, setRoutes] = useState([])
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState(emptyForm())
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function refresh() {
    const [routesData, schedulesData] = await Promise.all([listRoutes(), listRouteSchedules()])
    setRoutes(routesData)
    setSchedules(schedulesData)
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function toggleDay(day) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day) ? f.daysOfWeek.filter((d) => d !== day) : [...f.daysOfWeek, day].sort(),
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createRouteSchedule(form)
      setForm(emptyForm())
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(schedule) {
    setError(null)
    try {
      await updateRouteSchedule(schedule.id, { active: !schedule.active })
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  }

  async function handleDelete(schedule) {
    setError(null)
    try {
      await deleteRouteSchedule(schedule.id)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  }

  function routeLabel(routeId) {
    return routes.find((r) => r.id === routeId)?.label ?? routeId
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={CalendarClock} title="Schedules" description="Recurring departures the nightly job expands into real trips." />
      <Card className="max-w-xl">
        <h2 className="text-xl font-bold text-ink-900">New route schedule</h2>
        <p className="mt-1 text-sm text-ink-500">
          A recurring departure the nightly job expands into real trips for the next 30 days.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <select
            required
            value={form.routeId}
            onChange={(e) => setForm((f) => ({ ...f, routeId: e.target.value }))}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          >
            <option value="" disabled>
              Select a route
            </option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>

          <input
            type="time"
            required
            value={form.departureTime}
            onChange={(e) => setForm((f) => ({ ...f, departureTime: e.target.value }))}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          />

          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  form.daysOfWeek.includes(day) ? 'bg-brand-600 text-white' : 'bg-brand-50 text-ink-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-brand-700">{error}</p>}

          <Button type="submit" disabled={submitting || form.daysOfWeek.length === 0} className="mt-2">
            {submitting ? 'Creating...' : 'Create schedule'}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-xl font-bold text-ink-900">Existing schedules</h2>
        {loading ? (
          <LoadingState />
        ) : schedules.length === 0 ? (
          <EmptyState icon={CalendarClock} message="No schedules yet." />
        ) : (
          <div className="mt-4 flex flex-col divide-y divide-brand-50">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{routeLabel(schedule.routeId)}</p>
                  <p className="text-xs text-ink-500">
                    {schedule.departureTime} · {schedule.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(schedule)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      schedule.active ? 'bg-green-100 text-green-700' : 'bg-brand-50 text-ink-500'
                    }`}
                  >
                    {schedule.active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(schedule)}
                    className="rounded-full px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
