import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

/**
 * Gates nested routes behind auth + an optional role allowlist.
 * roles=null means "any authenticated user".
 */
export default function RequireRole({ roles = null, redirectTo = '/splash' }) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-50 text-ink-500">
        Loading...
      </div>
    )
  }

  if (!user) return <Navigate to={redirectTo} replace />
  if (roles && !roles.includes(role)) return <Navigate to="/" replace />

  return <Outlet />
}
