import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { promoteUser, listParks, ApiError } from '../../lib/api'

export default function PromoteUser() {
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('park_staff')
  const [homeParkId, setHomeParkId] = useState('')
  const [parks, setParks] = useState([])
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listParks()
      .then(setParks)
      .catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)
    try {
      const payload = { phone, role }
      if (role === 'park_staff' && homeParkId.trim()) payload.homeParkId = homeParkId.trim()
      const updated = await promoteUser(payload)
      setResult(updated)
      setPhone('')
      setHomeParkId('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        icon={UserPlus}
        title="Promote User"
        description="Staff and admin accounts aren't self-service — grant a role by phone number here."
      />
      <Card className="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="tel"
          placeholder="Phone number, e.g. +2348012345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        >
          <option value="park_staff">Park staff</option>
          <option value="admin">Admin</option>
        </select>

        {role === 'park_staff' && (
          <select
            value={homeParkId}
            onChange={(e) => setHomeParkId(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          >
            <option value="">Select home park</option>
            {parks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.city}
              </option>
            ))}
          </select>
        )}

        {error && <p className="text-sm text-brand-700">{error}</p>}
        {result && (
          <p className="text-sm text-green-700">
            {result.phone} is now {result.role}
            {result.homeParkId ? ` at ${parks.find((p) => p.id === result.homeParkId)?.name ?? 'the selected park'}` : ''}.
          </p>
        )}

        <Button type="submit" disabled={submitting} className="mt-2">
          {submitting ? 'Promoting...' : 'Promote'}
        </Button>
      </form>
      </Card>
    </div>
  )
}
