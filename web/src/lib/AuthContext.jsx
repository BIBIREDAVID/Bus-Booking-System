import { createContext, useContext, useEffect, useState } from 'react'
import { getMe, tokenStorage, logout as apiLogout } from './api'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tokenStorage.getAccessToken()) {
      setLoading(false)
      return
    }
    // api.ts transparently refreshes an expired access token on a 401,
    // so this also covers "returning user, access token expired but
    // refresh token still valid".
    getMe()
      .then(setUser)
      .catch(() => tokenStorage.clear())
      .finally(() => setLoading(false))
  }, [])

  function completeLogin(tokens, loggedInUser) {
    tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken)
    setUser(loggedInUser)
  }

  async function logout() {
    try {
      await apiLogout()
    } catch {
      // best-effort server-side revocation; clear local state regardless
    }
    tokenStorage.clear()
    setUser(null)
  }

  const value = {
    user,
    role: user?.role ?? null,
    loading,
    completeLogin,
    setUser,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
