import { useEffect, useState } from 'react'
import { Route as RouteIcon, Plus, X } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { listRoutes, getRouteDetail, listParks, createPark, createRoute, ApiError } from '../../lib/api'

function naira(n) {
  return `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function RouteDetailCard({ routeId }) {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    getRouteDetail(routeId).then(setDetail).catch(() => {})
  }, [routeId])

  if (!detail) return <LoadingState />

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Stops</p>
      <p className="mt-1 text-sm text-ink-900">{detail.stops.map((s) => s.parkName).join(' → ')}</p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Fares</p>
      <table className="mt-1 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-100 text-left text-xs font-semibold uppercase text-ink-500">
            <th className="py-2 pr-2">From</th>
            <th className="py-2 pr-2">To</th>
            <th className="py-2 pr-2">Standard</th>
            <th className="py-2 pr-2">Luxury</th>
            <th className="py-2">VIP</th>
          </tr>
        </thead>
        <tbody>
          {detail.fares.map((f) => (
            <tr key={f.id} className="border-b border-brand-50">
              <td className="py-2 pr-2">{f.from}</td>
              <td className="py-2 pr-2">{f.to}</td>
              <td className="py-2 pr-2">{naira(f.fareStandard)}</td>
              <td className="py-2 pr-2">{naira(f.fareLuxury)}</td>
              <td className="py-2">{naira(f.fareVip)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreateParkForm({ onCreated }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createPark({ name: name.trim(), city: city.trim(), state: state.trim() })
      setName('')
      setCity('')
      setState('')
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <input type="text" placeholder="Park name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[140px] rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400" />
      <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="w-32 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400" />
      <input type="text" placeholder="State" value={state} onChange={(e) => setState(e.target.value)} className="w-28 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400" />
      <Button type="submit" disabled={submitting || !name.trim() || !city.trim() || !state.trim()} className="px-4 py-2 text-xs">
        {submitting ? 'Adding...' : 'Add Park'}
      </Button>
      {error && <p className="w-full text-sm text-brand-700">{error}</p>}
    </form>
  )
}

const emptyFare = { standard: '', luxury: '', vip: '' }

function CreateRouteForm({ parks, onCreated }) {
  const [stopParkIds, setStopParkIds] = useState(['', ''])
  const [legFares, setLegFares] = useState([{ ...emptyFare }])
  const [durationMins, setDurationMins] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function setStop(index, value) {
    const next = [...stopParkIds]
    next[index] = value
    setStopParkIds(next)
  }

  function addStop() {
    setStopParkIds([...stopParkIds, ''])
    setLegFares([...legFares, { ...emptyFare }])
  }

  function removeStop(index) {
    if (stopParkIds.length <= 2) return
    setStopParkIds(stopParkIds.filter((_, i) => i !== index))
    setLegFares(legFares.filter((_, i) => i !== Math.min(index, legFares.length - 1)))
  }

  function setLegFare(index, field, value) {
    const next = [...legFares]
    next[index] = { ...next[index], [field]: value }
    setLegFares(next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createRoute({
        stopParkIds,
        legFares: legFares.map((f) => ({ standard: Number(f.standard), luxury: Number(f.luxury), vip: Number(f.vip) })),
        durationMins: Number(durationMins),
      })
      setStopParkIds(['', ''])
      setLegFares([{ ...emptyFare }])
      setDurationMins('')
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    stopParkIds.every(Boolean) &&
    new Set(stopParkIds).size === stopParkIds.length &&
    legFares.every((f) => f.standard && f.luxury && f.vip) &&
    durationMins

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Stops, in order</p>
      {stopParkIds.map((id, i) => (
        <div key={i} className="flex items-center gap-2">
          <select value={id} onChange={(e) => setStop(i, e.target.value)} className="flex-1 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400">
            <option value="">{i === 0 ? 'Origin park' : i === stopParkIds.length - 1 ? 'Destination park' : 'Stop park'}</option>
            {parks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.city}
              </option>
            ))}
          </select>
          {stopParkIds.length > 2 && (
            <button type="button" onClick={() => removeStop(i)} className="text-ink-400 hover:text-brand-600">
              <X size={16} />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addStop} className="flex items-center gap-1 self-start text-xs font-semibold text-brand-600">
        <Plus size={14} /> Add intermediate stop
      </button>

      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Fare per leg</p>
      {legFares.map((f, i) => (
        <div key={i} className="flex gap-2">
          <input type="number" placeholder="Standard" value={f.standard} onChange={(e) => setLegFare(i, 'standard', e.target.value)} className="flex-1 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400" />
          <input type="number" placeholder="Luxury" value={f.luxury} onChange={(e) => setLegFare(i, 'luxury', e.target.value)} className="flex-1 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400" />
          <input type="number" placeholder="VIP" value={f.vip} onChange={(e) => setLegFare(i, 'vip', e.target.value)} className="flex-1 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400" />
        </div>
      ))}

      <input type="number" placeholder="Total duration (minutes)" value={durationMins} onChange={(e) => setDurationMins(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400" />

      {error && <p className="text-sm text-brand-700">{error}</p>}

      <Button type="submit" disabled={submitting || !canSubmit} className="mt-1">
        {submitting ? 'Creating...' : 'Create Route'}
      </Button>
    </form>
  )
}

export default function RoutesPage() {
  const [routes, setRoutes] = useState(null)
  const [parks, setParks] = useState([])
  const [expanded, setExpanded] = useState(null)

  function refresh() {
    listRoutes().then(setRoutes).catch(() => {})
    listParks().then(setParks).catch(() => {})
  }

  useEffect(refresh, [])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={RouteIcon} title="Routes" description="Parks, routes, stops, and the fare for every board/alight pair." />

      <Card>
        <h2 className="text-base font-bold text-ink-900">Add a Park</h2>
        <div className="mt-3">
          <CreateParkForm onCreated={refresh} />
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-ink-900">Create a Route</h2>
        <p className="mt-0.5 text-xs text-ink-500">Fare for a non-adjacent stop pair is the sum of the legs between them.</p>
        <div className="mt-3">
          <CreateRouteForm parks={parks} onCreated={refresh} />
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-ink-900">Existing Routes</h2>
        <div className="mt-3">
          {routes === null ? (
            <LoadingState />
          ) : routes.length === 0 ? (
            <EmptyState icon={RouteIcon} message="No routes yet — create one above." />
          ) : (
            <div className="flex flex-col divide-y divide-brand-50">
              {routes.map((r) => (
                <div key={r.id} className="py-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <span className="text-sm font-semibold text-ink-900">{r.label}</span>
                    <span className="text-xs text-ink-500">{r.durationMins} min {expanded === r.id ? '▲' : '▼'}</span>
                  </button>
                  {expanded === r.id && (
                    <div className="mt-3">
                      <RouteDetailCard routeId={r.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
