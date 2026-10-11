import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { updateMyProfile, changePassword, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/AuthContext'

function ProfileEditor() {
  const { user, setUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const updated = await updateMyProfile({ name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() })
      setUser(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{user?.name ?? 'Rider'}</h2>
            <p className="mt-1 text-sm text-ink-500">{user?.email}</p>
            {user?.phone && <p className="text-sm text-ink-500">{user.phone}</p>}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-600">
            Edit
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="tel"
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        {error && <p className="text-sm text-brand-700">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setEditing(false)} className="flex-1">
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setDone(false)
    setSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setDone(true)
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-between rounded-2xl bg-white p-5 text-left shadow-[0_8px_24px_-12px_rgba(28,22,32,0.18)]"
      >
        <div>
          <p className="text-sm font-semibold text-ink-900">Change Password</p>
          <p className="mt-0.5 text-xs text-ink-500">Update your login password</p>
        </div>
        <span className="text-brand-600">›</span>
      </button>
    )
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="password"
          placeholder="New password (min. 8 characters)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        {error && <p className="text-sm text-brand-700">{error}</p>}
        {done && <p className="text-sm text-green-700">Password updated.</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || newPassword.length < 8} className="flex-1">
            {saving ? 'Updating...' : 'Update Password'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
            Close
          </Button>
        </div>
      </form>
    </Card>
  )
}

export default function Account() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-4">
      <ProfileEditor />

      {[
        { to: '/wallet', title: 'Wallet', description: 'Balance, top-ups, and transaction history' },
        { to: '/updates', title: 'Travel Updates', description: 'Delays, route changes, and holiday notices' },
        { to: '/complaints', title: 'Complaints', description: 'File and track ride complaints' },
        { to: '/lost-found', title: 'Lost & Found', description: 'Report a lost item or browse found items' },
        { to: '/support', title: 'Support', description: 'Payment, booking, and technical help' },
      ].map((item) => (
        <button
          key={item.to}
          type="button"
          onClick={() => navigate(item.to)}
          className="flex items-center justify-between rounded-2xl bg-white p-5 text-left shadow-[0_8px_24px_-12px_rgba(28,22,32,0.18)]"
        >
          <div>
            <p className="text-sm font-semibold text-ink-900">{item.title}</p>
            <p className="mt-0.5 text-xs text-ink-500">{item.description}</p>
          </div>
          <span className="text-brand-600">›</span>
        </button>
      ))}

      <ChangePassword />
    </div>
  )
}
