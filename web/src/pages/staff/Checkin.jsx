import { useEffect, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { ApiError, boardBooking, searchCheckin } from '../../lib/api'

function formatDeparture(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const SCANNER_ELEMENT_ID = 'qr-scanner-region'

export default function Checkin() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [boardingId, setBoardingId] = useState(null)
  const [notice, setNotice] = useState(null)

  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef(null)

  async function runSearch(q) {
    if (!q.trim()) return
    setSearching(true)
    setError(null)
    setNotice(null)
    try {
      const found = await searchCheckin(q.trim())
      setResults(found)
      if (found.length === 0) setError('No matching booking found for your park.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSearching(false)
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault()
    runSearch(query)
  }

  async function handleBoard(id) {
    setBoardingId(id)
    setError(null)
    try {
      const updated = await boardBooking(id)
      setResults((prev) => prev.map((r) => (r.id === id ? updated : r)))
      setNotice(`Checked in seat ${updated.seatNumber} — ${updated.riderName ?? updated.riderPhone}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBoardingId(null)
    }
  }

  useEffect(() => {
    if (!scanning) return

    let cancelled = false
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (cancelled) return
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID)
      scannerRef.current = scanner
      scanner
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 220 },
          (decodedText) => {
            setQuery(decodedText)
            runSearch(decodedText)
            setScanning(false)
          },
          () => {},
        )
        .catch((err) => {
          setError('Could not access camera: ' + (err?.message ?? String(err)))
          setScanning(false)
        })
    })

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner) {
        scanner.stop().catch(() => {}).finally(() => scanner.clear())
        scannerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader icon={ScanLine} title="Check-in" description="Find a passenger by name, phone, or ticket QR code." />
      <Card>
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            autoFocus
            placeholder="Passenger name, phone, or scan QR"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          />
          <Button type="submit" radius="lg" disabled={searching} className="px-4 py-3 text-sm">
            {searching ? '...' : 'Search'}
          </Button>
          <Button
            type="button"
            variant="outline"
            radius="lg"
            className="px-4 py-3 text-sm"
            onClick={() => setScanning((v) => !v)}
          >
            {scanning ? 'Stop' : 'Scan QR'}
          </Button>
        </form>

        {scanning && <div id={SCANNER_ELEMENT_ID} className="mt-3 overflow-hidden rounded-xl" />}

        {notice && <p className="mt-3 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>}
        {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}
      </Card>

      {results.length > 0 && (
        <div className="flex flex-col gap-3">
          {results.map((r) => (
            <Card key={r.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  {r.riderName ?? 'Unnamed'} · {r.riderPhone}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Seat {r.seatNumber} · {r.boardParkName} → {r.alightParkName} · {formatDeparture(r.departureTime)}
                </p>
              </div>
              {r.boarded ? (
                <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                  Boarded
                </span>
              ) : (
                <Button
                  radius="lg"
                  className="shrink-0 px-4 py-2 text-xs"
                  disabled={boardingId === r.id}
                  onClick={() => handleBoard(r.id)}
                >
                  {boardingId === r.id ? 'Checking in...' : 'Check In'}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
