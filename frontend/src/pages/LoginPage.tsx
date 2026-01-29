import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api/client'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{
    username?: string[]
    password?: string[]
    nonField?: string
  }>({})
  const [loading, setLoading] = useState(false)

  function parseErrors(err: any) {
    if (!err.response) {
      return { nonField: 'Network error. Please check your connection.' }
    }

    const errorData = err.response.data || {}
    const parsed: typeof errors = {}

    // Handle field-specific errors (can be array or string)
    if (errorData.username) {
      parsed.username = Array.isArray(errorData.username) 
        ? errorData.username 
        : [String(errorData.username)]
    }
    if (errorData.password) {
      parsed.password = Array.isArray(errorData.password) 
        ? errorData.password 
        : [String(errorData.password)]
    }

    // Handle non-field errors
    if (errorData.detail) {
      if (typeof errorData.detail === 'string') {
        parsed.nonField = errorData.detail
      } else if (Array.isArray(errorData.detail)) {
        parsed.nonField = errorData.detail[0]
      }
    }

    // If no field errors but we have a 400, show a general message
    if (!parsed.username && !parsed.password && !parsed.nonField) {
      if (err.response.status === 400) {
        parsed.nonField = 'Invalid username or password.'
      } else {
        parsed.nonField = 'Login failed. Please try again.'
      }
    }

    return parsed
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      const res = await api.post('/auth/login/', { username, password })
      login(res.data)
      navigate('/planner')
    } catch (err: any) {
      setErrors(parseErrors(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-left">
        <div className="auth-content">
          <div className="auth-brand">
            <h1>Truck HOS Trip Planner</h1>
            <p className="auth-tagline">Plan compliant trips with HOS-aware logs</p>
          </div>
          <div className="auth-features">
            <div className="feature-item">
              <div className="feature-icon">📊</div>
              <div>
                <h3>HOS Compliance</h3>
                <p>Stay compliant with Hours of Service regulations</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🗺️</div>
              <div>
                <h3>Smart Planning</h3>
                <p>Optimize routes with intelligent trip planning</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">⏱️</div>
              <div>
                <h3>Time Tracking</h3>
                <p>Automated logging and time management</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>Welcome back</h2>
            <p className="muted">Sign in to continue planning your trips</p>
          </div>
          <form onSubmit={handleSubmit} className="form">
            <label>
              <span>Username</span>
              <input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (errors.username) setErrors({ ...errors, username: undefined })
                }}
                autoComplete="username"
                placeholder="Enter your username"
                required
                className={errors.username ? 'input-error' : ''}
              />
              {errors.username && (
                <div className="field-error">{errors.username[0]}</div>
              )}
            </label>
            <label>
              <span>Password</span>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (errors.password) setErrors({ ...errors, password: undefined })
                  }}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  className={errors.password ? 'input-error' : ''}
                />
                <button
                  type="button"
                  className={`password-toggle ${showPassword ? 'password-visible' : ''}`}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && (
                <div className="field-error">{errors.password[0]}</div>
              )}
            </label>
            {errors.nonField && <div className="error-message">{errors.nonField}</div>}
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="auth-footer">
            Don't have an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

