import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'

const HOME_BY_ROLE = {
  rider: '/',
  park_staff: '/staff',
  admin: '/admin',
}

export default function Splash() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    const timer = setTimeout(() => {
      navigate(user ? HOME_BY_ROLE[user.role] : '/onboarding', { replace: true })
    }, 900)
    return () => clearTimeout(timer)
  }, [loading, user, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white">
        🚌
      </div>
      <p className="mt-4 text-lg font-bold text-ink-900">BookMyBus</p>
    </div>
  )
}
