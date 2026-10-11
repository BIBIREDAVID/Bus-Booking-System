import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { createStaffAccount, createAdminAccount, createDriverLogin, listParks, listDrivers, ApiError } from '../../lib/api'

const TABS = [
  { key: 'staff', label: 'Park Staff' },
  { key: 'admin', label: 'Admin' },
  { key: 'driver', label: 'Driver Login' },
]

function StaffForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [homeParkId, setHomeParkId] = useState('')
  const [parks, setParks] = useState([])
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listParks().then(setParks).catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)
    try {
      const created = await createStaffAccount({ name: name.trim(), email: email.trim().toLowerCase(), password, homeParkId })
      setResult(created)
      setName('')
      setEmail('')
      setPassword('')
      setHomeParkId('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400" />
      <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400" />
      <input type="password" placeholder="Temporary password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400" />
      <select value={homeParkId} onChange={(e) => setHomeParkId(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400">
        <option value="">Select home park</option>
        {parks.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.city}
          </option>
        ))}
      </select>

      {error && <p className="text-sm text-brand-700">{error}</p>}
      {result && <p className="text-sm text-green-700">{result.email} is now park staff at {parks.find((p) => p.id === result.homeParkId)?.name ?? 'the selected park'}.</p>}

      <Button type="submit" disabled={submitting || !name.trim() || !email.trim() || password.length < 8 || !homeParkId} className="mt-2">
        {submitting ? 'Creating...' : 'Create Staff Account'}
      </Button>
    </form>
  )
}

function AdminForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)
    try {
      const created = await createAdminAccount({ name: name.trim(), email: email.trim().toLowerCase(), password })
      setResult(created)
      setName('')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400" />
      <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400" />
      <input type="password" placeholder="Temporary password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400" />

      {error && <p className="text-sm text-brand-700">{error}</p>}
      {result && <p className="text-sm text-green-700">{result.email} is now an admin.</p>}

      <Button type="submit" disabled={submitting || !name.trim() || !email.trim() || password.length < 8} className="mt-2">
        {submitting ? 'Creating...' : 'Create Admin Account'}
      </Button>
    </form>
  )
}

function DriverLoginForm() {
  const [driverId, setDriverId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [drivers, setDrivers] = useState([])
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function refreshDrivers() {
    listDrivers().then(setDrivers).catch(() => {})
  }

  useEffect(refreshDrivers, [])

  const loginless = drivers.filter((d) => !d.hasLogin)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)
    try {
      const created = await createDriverLogin(driverId, { email: email.trim().toLowerCase(), password })
      setResult(created)
      setDriverId('')
      setEmail('')
      setPassword('')
      refreshDrivers()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (drivers.length > 0 && loginless.length === 0) {
    return <p className="text-sm text-ink-500">Every driver already has a login. Add a new driver from Fleet & Drivers first.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400">
        <option value="">Select a driver</option>
        {loginless.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} — {d.phone}
          </option>
        ))}
      </select>
      <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400" />
      <input type="password" placeholder="Temporary password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400" />

      {error && <p className="text-sm text-brand-700">{error}</p>}
      {result && <p className="text-sm text-green-700">{result.email} can now sign in as that driver.</p>}

      <Button type="submit" disabled={submitting || !driverId || !email.trim() || password.length < 8} className="mt-2">
        {submitting ? 'Creating...' : 'Create Driver Login'}
      </Button>
    </form>
  )
}

export default function TeamMembers() {
  const [tab, setTab] = useState('staff')

  return (
    <div>
      <PageHeader icon={UserPlus} title="Team Members" description="Staff, admin, and driver logins aren't self-service — create them here." />
      <Card className="max-w-md">
        <div className="mb-4 flex gap-1 rounded-xl bg-brand-50/70 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'staff' && <StaffForm />}
        {tab === 'admin' && <AdminForm />}
        {tab === 'driver' && <DriverLoginForm />}
      </Card>
    </div>
  )
}
