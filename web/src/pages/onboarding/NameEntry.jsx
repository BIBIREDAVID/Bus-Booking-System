import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingScreen from '../../components/OnboardingScreen'
import Button from '../../components/Button'
import { updateMyName, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/AuthContext'

export default function NameEntry() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
      const updated = await updateMyName(fullName)
      setUser(updated)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OnboardingScreen
      title="Let's Get to Know You"
      subtitle="Tell us your name to personalize your experience and make your bookings smoother."
      onBack={false}
    >
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3">
        <input
          type="text"
          placeholder="First Name"
          autoFocus
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="text"
          placeholder="Last Name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />

        {error && <p className="text-sm text-brand-700">{error}</p>}

        <div className="mt-auto flex flex-col items-center gap-4 pt-8">
          <Button type="submit" radius="lg" disabled={submitting || !firstName.trim()} className="w-full py-4">
            {submitting ? 'Saving...' : 'Continue'}
          </Button>
          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-100" />
            <span className="h-1.5 w-1.5 rounded-full bg-brand-100" />
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
          </div>
        </div>
      </form>
    </OnboardingScreen>
  )
}
