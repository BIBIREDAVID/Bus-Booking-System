import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function LogoutButton() {
  const navigate = useNavigate()
  const { logout } = useAuth()

  async function handleLogout() {
    await logout()
    navigate('/onboarding', { replace: true })
  }

  return (
    <button type="button" onClick={handleLogout} className="text-sm font-semibold text-white/90 hover:text-white">
      Log out
    </button>
  )
}
