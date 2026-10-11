import { useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import {
  listBuses,
  createBus,
  updateBusStatus,
  listDrivers,
  createDriver,
  updateDriverStatus,
  ApiError,
} from '../../lib/api'

function BusesSection() {
  const [buses, setBuses] = useState(null)
  const [plate, setPlate] = useState('')
  const [capacity, setCapacity] = useState('')
  const [busClass, setBusClass] = useState('standard')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function refresh() {
    listBuses().then(setBuses).catch(() => {})
  }

  useEffect(refresh, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createBus({ plate: plate.trim(), capacity: Number(capacity), class: busClass })
      setPlate('')
      setCapacity('')
      refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(bus) {
    const next = bus.status === 'active' ? 'maintenance' : 'active'
    await updateBusStatus(bus.id, next)
    refresh()
  }

  return (
    <Card>
      <h2 className="text-base font-bold text-ink-900">Buses</h2>

      <form onSubmit={handleCreate} className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Plate number"
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          className="flex-1 min-w-[140px] rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="number"
          placeholder="Capacity"
          min="1"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="w-24 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <select
          value={busClass}
          onChange={(e) => setBusClass(e.target.value)}
          className="rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
        >
          <option value="standard">Standard</option>
          <option value="luxury">Luxury</option>
          <option value="vip">VIP</option>
        </select>
        <Button type="submit" disabled={submitting || !plate.trim() || !capacity} className="px-4 py-2 text-xs">
          {submitting ? 'Adding...' : 'Add Bus'}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-brand-700">{error}</p>}

      <div className="mt-4">
        {buses === null ? (
          <LoadingState />
        ) : buses.length === 0 ? (
          <EmptyState icon={Truck} message="No buses yet." />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-xs font-semibold uppercase text-ink-500">
                <th className="py-2 pr-2">Plate</th>
                <th className="py-2 pr-2">Capacity</th>
                <th className="py-2 pr-2">Class</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {buses.map((b) => (
                <tr key={b.id} className="border-b border-brand-50">
                  <td className="py-2 pr-2 font-semibold text-ink-900">{b.plate}</td>
                  <td className="py-2 pr-2">{b.capacity}</td>
                  <td className="py-2 pr-2 capitalize">{b.class}</td>
                  <td className="py-2 pr-2 capitalize">{b.status}</td>
                  <td className="py-2">
                    <button type="button" onClick={() => toggleStatus(b)} className="text-xs font-semibold text-brand-600">
                      {b.status === 'active' ? 'Mark maintenance' : 'Mark active'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}

function DriversSection() {
  const [drivers, setDrivers] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [licenseNo, setLicenseNo] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function refresh() {
    listDrivers().then(setDrivers).catch(() => {})
  }

  useEffect(refresh, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createDriver({ name: name.trim(), phone: phone.trim(), licenseNo: licenseNo.trim() })
      setName('')
      setPhone('')
      setLicenseNo('')
      refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(driver) {
    const next = driver.status === 'active' ? 'inactive' : 'active'
    await updateDriverStatus(driver.id, next)
    refresh()
  }

  return (
    <Card>
      <h2 className="text-base font-bold text-ink-900">Drivers</h2>
      <p className="mt-0.5 text-xs text-ink-500">
        Adding a driver here only creates fleet/assignment data — grant them app login access from Team Members.
      </p>

      <form onSubmit={handleCreate} className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[140px] rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="tel"
          placeholder="Phone, e.g. +2348012345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="flex-1 min-w-[160px] rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="text"
          placeholder="License number"
          value={licenseNo}
          onChange={(e) => setLicenseNo(e.target.value)}
          className="w-36 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <Button type="submit" disabled={submitting || !name.trim() || !phone.trim() || !licenseNo.trim()} className="px-4 py-2 text-xs">
          {submitting ? 'Adding...' : 'Add Driver'}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-brand-700">{error}</p>}

      <div className="mt-4">
        {drivers === null ? (
          <LoadingState />
        ) : drivers.length === 0 ? (
          <EmptyState icon={Truck} message="No drivers yet." />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-xs font-semibold uppercase text-ink-500">
                <th className="py-2 pr-2">Name</th>
                <th className="py-2 pr-2">Phone</th>
                <th className="py-2 pr-2">License</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Login</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id} className="border-b border-brand-50">
                  <td className="py-2 pr-2 font-semibold text-ink-900">{d.name}</td>
                  <td className="py-2 pr-2">{d.phone}</td>
                  <td className="py-2 pr-2">{d.licenseNo}</td>
                  <td className="py-2 pr-2 capitalize">{d.status}</td>
                  <td className="py-2 pr-2">{d.hasLogin ? 'Yes' : '—'}</td>
                  <td className="py-2">
                    <button type="button" onClick={() => toggleStatus(d)} className="text-xs font-semibold text-brand-600">
                      {d.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}

export default function Fleet() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={Truck} title="Fleet & Drivers" description="Buses and drivers available for trip assignment." />
      <BusesSection />
      <DriversSection />
    </div>
  )
}
