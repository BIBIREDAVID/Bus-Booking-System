import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingScreen from '../../components/OnboardingScreen'
import Card from '../../components/Card'
import Button from '../../components/Button'
import OtpInput from '../../components/OtpInput'
import { requestOtp, verifyOtp, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/AuthContext'
import { useOnboardingFlow } from './OnboardingFlowContext'

const HOME_BY_ROLE = {
  rider: '/',
  park_staff: '/staff',
  admin: '/admin',
}

export default function OtpVerify() {
  const navigate = useNavigate()
  const { phone } = useOnboardingFlow()
  const { completeLogin } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (!phone) navigate('/onboarding/phone', { replace: true })
  }, [phone, navigate])

  async function handleSubmit(e) {
    e?.preventDefault()
    if (code.length !== 6) return
    setError(null)
    setSubmitting(true)
    try {
      const { accessToken, refreshToken, isNewUser, user } = await verifyOtp(phone, code)
      completeLogin({ accessToken, refreshToken }, user)
      setVerified(true)
      setTimeout(() => {
        navigate(isNewUser ? '/onboarding/name' : HOME_BY_ROLE[user.role], { replace: true })
      }, 1200)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setError(null)
    setResending(true)
    try {
      await requestOtp(phone)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="relative">
      <OnboardingScreen
        title="Verify Your Phone Number"
        subtitle={`We've sent a 6-digit code to ${phone}. Please enter it below to continue.`}
      >
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <OtpInput value={code} onChange={setCode} />

          {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}

          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="mt-4 self-start text-sm font-semibold text-ink-500 disabled:opacity-50"
          >
            {resending ? 'Resending...' : "Didn't receive the code? Resend"}
          </button>

          <div className="mt-auto flex flex-col gap-3 pt-8">
            <Button variant="outline" radius="lg" type="button" onClick={handleResend} disabled={resending}>
              Resend
            </Button>
            <Button type="submit" radius="lg" disabled={submitting || code.length !== 6} className="py-4">
              {submitting ? 'Verifying...' : 'Submit'}
            </Button>
          </div>
        </form>
      </OnboardingScreen>

      {verified && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink-900/40 px-6">
          <Card className="w-full max-w-xs text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl text-brand-600">
              ✓
            </div>
            <h2 className="mt-4 text-lg font-bold text-ink-900">Verification Success!</h2>
            <p className="mt-2 text-sm text-ink-500">
              Your number has been verified. Proceeding to create your account.
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
