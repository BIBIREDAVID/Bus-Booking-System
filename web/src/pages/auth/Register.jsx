import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingScreen from '../../components/OnboardingScreen'
import Button from '../../components/Button'
import { registerRider, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/AuthContext'

export default function Register() {
  const navigate = useNavigate()
  const { completeLogin } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const session = await registerRider({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
      })
      completeLogin(session, session.user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OnboardingScreen title="Create Your Account" subtitle="Book trips, manage your wallet, and track every ride." onBack={() => navigate('/login')}>
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3">
        <input
          type="text"
          placeholder="Full name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="email"
          placeholder="Email address"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="tel"
          placeholder="Phone number (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="password"
          placeholder="Password (min. 8 characters)"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />

        {error && <p className="text-sm text-brand-700">{error}</p>}

        <div className="mt-auto pt-8">
          <Button
            type="submit"
            radius="lg"
            disabled={submitting || !name.trim() || !email.trim() || password.length < 8}
            className="w-full py-4"
          >
            {submitting ? 'Creating account...' : 'Create Account'}
          </Button>
          <p className="mt-4 text-center text-sm text-ink-500">
            Already have an account?{' '}
            <button type="button" onClick={() => navigate('/login/rider')} className="font-semibold text-brand-600">
              Sign in
            </button>
          </p>
        </div>
      </form>
    </OnboardingScreen>
  )
}
