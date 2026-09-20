import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, listParks, searchTrips } from '../../lib/api'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatDeparture(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Search() {
  const navigate = useNavigate()
  const [parks, setParks] = useState([])
  const [originParkId, setOriginParkId] = useState('')
  const [destParkId, setDestParkId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    listParks()
      .then(setParks)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load parks'))
  }, [])

  function swapParks() {
    setOriginParkId(destParkId)
    setDestParkId(originParkId)
  }

  async function handleSearch(e) {
    e.preventDefault()
    setError(null)
    setSearching(true)
    setResults(null)
    try {
      const { results } = await searchTrips({ originParkId, destParkId, date })
      setResults(results)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSearching(false)
    }
  }

  function selectTrip(result) {
    navigate(
      `/trips/${result.tripId}/seats?board=${result.boardStopId}&alight=${result.alightStopId}` +
        `&from=${encodeURIComponent(result.originParkName)}&to=${encodeURIComponent(result.destParkName)}` +
        `&when=${encodeURIComponent(result.departureTime)}&fare=${result.fare ?? ''}`,
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <form onSubmit={handleSearch} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-500">Where you'll board</span>
            <select
              required
              value={originParkId}
              onChange={(e) => setOriginParkId(e.target.value)}
              className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
            >
              <option value="" disabled>
                Boarding point
              </option>
              {parks.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === destParkId}>
                  {p.name} — {p.city}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={swapParks}
            disabled={!originParkId && !destParkId}
            className="self-center rounded-full border border-brand-100 px-3 py-1 text-xs font-semibold text-brand-600 disabled:opacity-40"
          >
            ⇅ Swap
          </button>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-500">Drop-off point</span>
            <select
              required
              value={destParkId}
              onChange={(e) => setDestParkId(e.target.value)}
              className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
            >
              <option value="" disabled>
                Drop-off point
              </option>
              {parks.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === originParkId}>
                  {p.name} — {p.city}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-500">Travel date</span>
            <input
              type="date"
              required
              min={todayISO()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
            />
          </label>

          {error && <p className="text-sm text-brand-700">{error}</p>}

          <Button type="submit" radius="lg" disabled={searching} className="mt-1 py-4">
            {searching ? 'Searching...' : 'Search buses'}
          </Button>
        </form>
      </Card>

      {results !== null && (
        <div className="flex flex-col gap-3">
          {results.length === 0 ? (
            <p className="text-center text-sm text-ink-500">No buses found for that route and date.</p>
          ) : (
            results.map((result) => (
              <Card key={result.tripId} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {result.originParkName} → {result.destParkName}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDeparture(result.departureTime)}
                    {result.bus && ` · ${result.bus.plate} · ${result.bus.class}`}
                  </p>
                  {result.fare && <p className="mt-1 text-sm font-bold text-brand-600">₦{result.fare}</p>}
                </div>
                <Button radius="lg" className="px-4 py-2 text-xs" onClick={() => selectTrip(result)}>
                  Select Seats
                </Button>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
