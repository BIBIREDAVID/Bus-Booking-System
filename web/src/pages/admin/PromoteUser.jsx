import { useState } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { promoteUser, ApiError } from '../../lib/api'

export default function PromoteUser() {
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('park_staff')
  const [homeParkId, setHomeParkId] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

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
    <Card className="max-w-md">
      <h2 className="text-xl font-bold text-ink-900">Promote a user</h2>
      <p className="mt-1 text-sm text-ink-500">
        Staff and admin accounts aren't self-service — look up a rider by phone number and grant them a role here.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
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
          <input
            type="text"
            placeholder="Home park ID (UUID)"
            value={homeParkId}
            onChange={(e) => setHomeParkId(e.target.value)}
            className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
          />
        )}

        {error && <p className="text-sm text-brand-700">{error}</p>}
        {result && (
          <p className="text-sm text-green-700">
            {result.phone} is now {result.role}
            {result.homeParkId ? ` at park ${result.homeParkId}` : ''}.
          </p>
        )}

        <Button type="submit" disabled={submitting} className="mt-2">
          {submitting ? 'Promoting...' : 'Promote'}
        </Button>
      </form>
    </Card>
  )
}
