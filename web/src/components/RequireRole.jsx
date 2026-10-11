import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import Login from '../pages/auth/Login'

/**
 * Gates nested routes behind auth + an optional role allowlist.
 * roles=null means "any authenticated user".
 *
 * When logged out, renders that role's login page directly at the
 * same URL (loginRole) instead of redirecting elsewhere — so e.g.
 * /staff shows the Park Staff sign-in form to a logged-out visitor
 * and the Staff Dashboard to a signed-in one, both at /staff. Falls
 * back to a redirect if no loginRole is given.
 */
export default function RequireRole({ roles = null, redirectTo = '/', loginRole = null }) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-50 text-ink-500">
        Loading...
      </div>
    )
  }

  if (!user) {
    if (loginRole) return <Login role={loginRole} />
    return <Navigate to={redirectTo} replace />
  }
  if (roles && !roles.includes(role)) return <Navigate to="/" replace />

  return <Outlet />
}
