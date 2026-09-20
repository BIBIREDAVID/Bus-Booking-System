import { useEffect, useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { ApiError, listAdminComplaints, updateAdminComplaint } from '../../lib/api'

const STATUS_OPTIONS = ['open', 'in_review', 'resolved']

const STATUS_TONE = {
  open: 'bg-amber-50 text-amber-700',
  in_review: 'bg-blue-50 text-blue-700',
  resolved: 'bg-green-50 text-green-700',
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function Complaints() {
  const [complaints, setComplaints] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState({})

  function load() {
    setLoading(true)
    setError(null)
    listAdminComplaints({ status: statusFilter || undefined })
      .then(setComplaints)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [statusFilter])

  async function handleUpdate(id, status) {
    const notes = editing[id] ?? ''
    try {
      const updated = await updateAdminComplaint(id, { status, resolutionNotes: notes || undefined })
      setComplaints((prev) => prev.map((c) => (c.id === id ? updated : c)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader icon={MessageSquareWarning} title="Complaints" description="Triage and resolve rider complaints." />
      <div className="-mt-2 flex items-center justify-end">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-brand-700">{error}</p>}

      {loading ? (
        <LoadingState />
      ) : complaints.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} message="No complaints found." />
      ) : (
        complaints.map((c) => (
          <Card key={c.id}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  {c.riderName ?? 'Unnamed'} · {c.riderPhone}
                </p>
                <p className="text-xs text-ink-500">
                  {c.category.replace('_', ' ')} · {formatDate(c.createdAt)}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[c.status]}`}>
                {c.status.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-900">{c.message}</p>
            {c.tripLabel && <p className="mt-1 text-xs text-ink-500">{c.tripLabel}</p>}

            <div className="mt-3 flex flex-col gap-2">
              <textarea
                rows={2}
                placeholder="Resolution notes"
                defaultValue={c.resolutionNotes ?? ''}
                onChange={(e) => setEditing((prev) => ({ ...prev, [c.id]: e.target.value }))}
                className="rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
              <div className="flex gap-2">
                {STATUS_OPTIONS.filter((s) => s !== c.status).map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    radius="lg"
                    className="px-3 py-2 text-xs capitalize"
                    onClick={() => handleUpdate(c.id, s)}
                  >
                    Mark {s.replace('_', ' ')}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
