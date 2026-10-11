import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import OnboardingScreen from '../../components/OnboardingScreen'
import Button from '../../components/Button'
import { login, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/AuthContext'

const ROLE_META = {
  rider: { title: 'Rider Sign In', expectedRole: 'rider' },
  staff: { title: 'Park Staff Sign In', expectedRole: 'park_staff' },
  driver: { title: 'Driver Sign In', expectedRole: 'driver' },
  admin: { title: 'Admin Sign In', expectedRole: 'admin' },
}

const HOME_BY_ROLE = {
  rider: '/',
  park_staff: '/staff',
  driver: '/driver',
  admin: '/admin',
}

export default function Login() {
  const navigate = useNavigate()
  const { role: roleParam } = useParams()
  const { completeLogin } = useAuth()
  const meta = ROLE_META[roleParam] ?? ROLE_META.rider

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      const session = await login(email.trim().toLowerCase(), password)
      completeLogin(session, session.user)

      // The server decides the role, not the login page used — if they
      // don't match, we still log the person in (that's the account
      // that owns the credentials) and just send them where they
      // actually belong, with a brief explanation.
      if (session.user.role !== meta.expectedRole) {
        setNotice(`This is a ${session.user.role.replace('_', ' ')} account — taking you there instead.`)
      }
      navigate(HOME_BY_ROLE[session.user.role] ?? '/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OnboardingScreen title={meta.title} subtitle="Sign in with your email and password." onBack={() => navigate('/login')}>
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3">
        <input
          type="email"
          placeholder="Email address"
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
        />

        {error && <p className="text-sm text-brand-700">{error}</p>}
        {notice && <p className="text-sm text-ink-500">{notice}</p>}

        <div className="mt-auto pt-8">
          <Button type="submit" radius="lg" disabled={submitting || !email || !password} className="w-full py-4">
            {submitting ? 'Signing in...' : 'Sign In'}
          </Button>
          {roleParam === 'rider' && (
            <p className="mt-4 text-center text-sm text-ink-500">
              New rider?{' '}
              <button type="button" onClick={() => navigate('/register')} className="font-semibold text-brand-600">
                Create an account
              </button>
            </p>
          )}
        </div>
      </form>
    </OnboardingScreen>
  )
}
