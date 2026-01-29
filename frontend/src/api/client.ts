import axios, { type AxiosRequestConfig, type AxiosError } from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

const ACCESS_KEY = 'truck_hos_access'
const REFRESH_KEY = 'truck_hos_refresh'

type RetriableAxiosConfig = AxiosRequestConfig & {
  _retry?: boolean
}

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// Attach token to every request (so routes don't randomly 401)
api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(ACCESS_KEY)
  if (token) {
    config.headers = {
      ...(config.headers as Record<string, string>),
      Authorization: `Bearer ${token}`,
    } as typeof config.headers
  }
  return config
})

let refreshInFlight: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refresh = window.localStorage.getItem(REFRESH_KEY)
  if (!refresh) {
    throw new Error('No refresh token available')
  }

  // Call refresh endpoint WITHOUT using `api` (to avoid interceptor loops)
  const res = await axios.post(
    `${baseURL}/auth/refresh/`,
    { refresh },
    { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } },
  )

  const access = (res.data as any)?.access as string | undefined
  const newRefresh = (res.data as any)?.refresh as string | undefined
  if (!access) {
    throw new Error('Refresh endpoint did not return access token')
  }

  window.localStorage.setItem(ACCESS_KEY, access)
  if (newRefresh) {
    window.localStorage.setItem(REFRESH_KEY, newRefresh)
  }

  return access
}

// Global interceptor to handle 401 errors (invalid tokens)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status !== 401) {
      return Promise.reject(error)
    }

    const originalConfig = (error.config || {}) as RetriableAxiosConfig

    // Only handle 401s for requests that actually attempted auth
    const hadAuthHeader =
      typeof (originalConfig.headers as any)?.Authorization === 'string' ||
      typeof (originalConfig.headers as any)?.authorization === 'string'

    // Don't try to refresh on the refresh endpoint itself
    const url = String(originalConfig.url || '')
    const isRefreshCall = url.includes('/auth/refresh/')

    if (hadAuthHeader && !isRefreshCall && !originalConfig._retry) {
      originalConfig._retry = true
      try {
        if (!refreshInFlight) {
          refreshInFlight = refreshAccessToken().finally(() => {
            refreshInFlight = null
          })
        }
        const newAccess = await refreshInFlight

        // Retry the original request with the new token
        originalConfig.headers = {
          ...(originalConfig.headers as Record<string, string>),
          Authorization: `Bearer ${newAccess}`,
        } as typeof originalConfig.headers
        return api.request(originalConfig)
      } catch {
        // fall through to logout below
      }
    }

    // If we get here: refresh failed or not applicable → clear tokens and redirect
    if (hadAuthHeader) {
      window.localStorage.removeItem(ACCESS_KEY)
      window.localStorage.removeItem(REFRESH_KEY)

      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }
)

export function withAuth(config: AxiosRequestConfig, accessToken: string | null) {
  if (!accessToken) return config
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  }
}

