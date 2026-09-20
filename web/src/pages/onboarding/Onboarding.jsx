import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'

// Placeholder — a real build would swipe through a few of these
// (language, features, etc.) before phone entry.
export default function Onboarding() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-brand-600 px-6 py-10 text-center text-white">
      <div />

      <div className="flex flex-col items-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-5xl">🚌</div>
        <h1 className="mt-8 text-2xl font-bold">Book Buses Anytime, Anywhere Easily</h1>
        <p className="mt-3 max-w-xs text-sm text-white/80">
          Compare routes, track your bus live, and reserve your seat in seconds.
        </p>
      </div>

      <div className="w-full max-w-sm">
        <Button variant="light" radius="lg" className="w-full py-4" onClick={() => navigate('/onboarding/phone')}>
          Get Started
        </Button>
      </div>
    </div>
  )
}
