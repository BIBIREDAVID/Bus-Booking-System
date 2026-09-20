import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingScreen from '../../components/OnboardingScreen'
import Button from '../../components/Button'
import { requestOtp, ApiError } from '../../lib/api'
import { useOnboardingFlow } from './OnboardingFlowContext'

export default function PhoneEntry() {
  const navigate = useNavigate()
  const { setPhone } = useOnboardingFlow()
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const fullPhone = `+${value.replace(/\D/g, '')}`
    try {
      await requestOtp(fullPhone)
      setPhone(fullPhone)
      navigate('/onboarding/otp')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OnboardingScreen title="Enter Your Number" subtitle="We'll send an SMS code to verify it's you.">
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <label className="flex items-center gap-2 rounded-xl border border-brand-100 px-4 py-3 focus-within:border-brand-400">
          <span className="text-sm font-semibold text-ink-500">+</span>
          <input
            type="tel"
            inputMode="tel"
            autoFocus
            placeholder="234 801 234 5678"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full text-sm outline-none"
          />
        </label>

        {error && <p className="mt-2 text-sm text-brand-700">{error}</p>}

        <div className="mt-auto pt-8">
          <Button type="submit" radius="lg" disabled={submitting} className="w-full py-4">
            {submitting ? 'Sending...' : 'Continue'}
          </Button>
        </div>
      </form>
    </OnboardingScreen>
  )
}
