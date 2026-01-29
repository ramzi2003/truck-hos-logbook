import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

type AuthContextValue = {
  isAuthenticated: boolean
  accessToken: string | null
  login: (tokens: { access: string; refresh: string }) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const ACCESS_KEY = 'truck_hos_access'
const REFRESH_KEY = 'truck_hos_refresh'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(true)

  useEffect(() => {
    const stored = window.localStorage.getItem(ACCESS_KEY)
    if (stored) {
      setAccessToken(stored)
    }
    setIsValidating(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: !!accessToken && !isValidating,
      accessToken,
      login: ({ access, refresh }) => {
        setAccessToken(access)
        window.localStorage.setItem(ACCESS_KEY, access)
        window.localStorage.setItem(REFRESH_KEY, refresh)
      },
      logout: () => {
        setAccessToken(null)
        window.localStorage.removeItem(ACCESS_KEY)
        window.localStorage.removeItem(REFRESH_KEY)
      },
    }),
    [accessToken, isValidating],
  )

  // Show nothing while validating to prevent flash of wrong content
  if (isValidating) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

