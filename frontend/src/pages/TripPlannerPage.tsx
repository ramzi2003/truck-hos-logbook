import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api/client'
import { TripForm } from '../components/TripForm'
import { HosLog } from '../components/HosLog'
import { MapView } from '../components/MapView'

type TripPlanResponse = {
  distance_m: number
  duration_s: number
  geometry: number[][]
  stops: any[]
  waypoints?: { type: string; lng: number; lat: number; label: string }[]
  logs: {
    date: string
    segments: {
      status: 'OFF' | 'SB' | 'D' | 'ON'
      start_iso: string
      end_iso: string
    }[]
  }[]
  instructions: string[]
  trip_id?: number
}

type TripFormSavedValues = {
  current_location: string
  pickup_location: string
  dropoff_location: string
  current_cycle_hours_used: number
}

export function TripPlannerPage() {
  const { accessToken, logout } = useAuth()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<TripPlanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFormValues, setSavedFormValues] = useState<TripFormSavedValues | null>(null)

  /** Merge consecutive "Drive for X hours" instructions into one (e.g. 3× "2h" → 1× "6h"). */
  function mergeConsecutiveDrives(instructions: string[]): string[] {
    const result: string[] = []
    const driveRegex = /^(.+?):\s*Drive for ([0-9]+(?:\.[0-9]+)?) hours?\.?\s*$/i
    let acc: { prefix: string; totalHours: number } | null = null

    for (const line of instructions) {
      const match = line.match(driveRegex)
      if (match) {
        const [, prefix, hrsStr] = match
        const hrs = Number(hrsStr)
        if (!Number.isFinite(hrs)) continue
        if (acc) {
          acc.totalHours += hrs
        } else {
          acc = { prefix: prefix!.trim(), totalHours: hrs }
        }
        continue
      }
      if (acc) {
        result.push(`${acc.prefix}: Drive for ${acc.totalHours} hours.`)
        acc = null
      }
      result.push(line)
    }
    if (acc) {
      result.push(`${acc.prefix}: Drive for ${acc.totalHours} hours.`)
    }
    return result
  }

  function parseInstructionLine(line: string): { time?: string; title: string; detail?: string } {
    // Backend format examples:
    // "2026-01-28T07:00+00:00: Pickup – 1 hour ON duty."
    // "2026-01-28T08:00+00:00: Drive for 2.0 hours."
    const idx = line.indexOf(': ')
    const maybeTs = idx > 0 ? line.slice(0, idx) : ''
    const text = idx > 0 ? line.slice(idx + 2) : line

    // Extract HH:MM from the timestamp (no timezone conversion).
    const timeMatch = /T(\d{2}:\d{2})/.exec(maybeTs)
    const time = timeMatch?.[1]

    // Normalize dashes and whitespace for parsing.
    const clean = text.replace(/[‑–—]/g, '-').replace(/\s+/g, ' ').trim()

    // Pattern-based friendly formatting.
    const drive = /^Drive for ([0-9]+(?:\.[0-9]+)?) hours?\.?$/i.exec(clean)
    if (drive) {
      const hrs = Number(drive[1])
      const hrsText = Number.isFinite(hrs) ? (Math.abs(hrs - Math.round(hrs)) < 1e-6 ? `${Math.round(hrs)}h` : `${hrs.toFixed(1)}h`) : drive[1]
      return { time, title: 'Drive', detail: `Driving • ${hrsText}` }
    }

    const pickup = /^Pickup\s*-\s*1 hour ON duty\.?$/i.exec(clean)
    if (pickup) return { time, title: 'Pickup', detail: 'On duty • 1h' }

    const dropoff = /^Drop-?off\s*-\s*1 hour ON duty\.?$/i.exec(clean)
    if (dropoff) return { time, title: 'Drop-off', detail: 'On duty • 1h' }

    const fuel = /^Fuel stop\s*-\s*([0-9]+)\s*minutes?\s*ON duty\.?$/i.exec(clean)
    if (fuel) return { time, title: 'Fuel stop', detail: `On duty • ${fuel[1]} min` }

    const breakOff = /^([0-9]+)-minute break\s*\(OFF duty\)\.?$/i.exec(clean)
    if (breakOff) return { time, title: 'Break', detail: `Off duty • ${breakOff[1]} min` }

    const endDay = /^End of day\s*-\s*([0-9]+)\s*hours?\s*OFF\.?$/i.exec(clean)
    if (endDay) return { time, title: 'End of day', detail: `Off duty • ${endDay[1]}h` }

    const restart = /^34-hour OFF restart.*$/i.exec(clean)
    if (restart) return { time, title: '34-hour restart', detail: 'Off duty • 34h' }

    // Generic split on " - " if present, and normalize duty wording.
    const dashSplitIdx = clean.indexOf(' - ')
    if (dashSplitIdx >= 0) {
      const title = clean.slice(0, dashSplitIdx).trim()
      const detailRaw = clean.slice(dashSplitIdx + 3).trim().replace(/\.$/, '')
      const detail = detailRaw
        .replace(/\bON duty\b/gi, 'On duty')
        .replace(/\bOFF duty\b/gi, 'Off duty')
      return { time, title, detail }
    }

    return { time, title: clean.replace(/\.$/, '') }
  }

  useEffect(() => {
    if (accessToken) {
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`
    }
  }, [accessToken])

  async function handleLoadSaved() {
    if (!accessToken) return
    setLoadingSaved(true)
    setError(null)
    try {
      const listRes = await api.get('/trips/history/', { params: { limit: 1 } })
      const latest = listRes.data?.results?.[0]
      if (!latest?.id) {
        setPlan(null)
        return
      }
      const detailRes = await api.get(`/trips/history/${latest.id}/`)
      const savedPlan = detailRes.data?.plan
      // Include trip_id so the logbook page can load saved form data (truck numbers, carrier, etc.)
      setPlan(savedPlan ? { ...savedPlan, trip_id: latest.id } : null)

      // Also hydrate the left-hand form with the saved trip inputs.
      setSavedFormValues({
        current_location: detailRes.data?.current_location ?? '',
        pickup_location: detailRes.data?.pickup_location ?? '',
        dropoff_location: detailRes.data?.dropoff_location ?? '',
        current_cycle_hours_used: detailRes.data?.current_cycle_hours_used ?? 0,
      })
    } catch (err: any) {
      // If user has no trips yet, backend may 404 – show a friendly message
      const msg = err?.response?.data?.detail
      setError(msg || 'No saved trip found. Plan a new trip to get started.')
    } finally {
      setLoadingSaved(false)
    }
  }

  // Load latest saved plan on refresh
  useEffect(() => {
    if (!accessToken) return
    void handleLoadSaved()
  }, [accessToken])

  async function handlePlanTrip(values: any) {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/trips/plan/', values)
      setPlan(res.data)
      // After planning a new trip, keep the form values in sync so a refresh or
      // later "load last saved trip" reflects what the driver entered.
      setSavedFormValues({
        current_location: values.current_location ?? '',
        pickup_location: values.pickup_location ?? '',
        dropoff_location: values.dropoff_location ?? '',
        current_cycle_hours_used: values.current_cycle_hours_used ?? 0,
      })
    } catch (err: any) {
      const data = err.response?.data
      let msg: string | undefined =
        typeof data?.detail === 'string' ? data.detail : undefined
      if (!msg && data && typeof data === 'object' && !Array.isArray(data)) {
        const flatten = (obj: unknown, prefix = ''): string[] => {
          if (obj == null) return []
          if (typeof obj === 'string') return [prefix ? `${prefix}: ${obj}` : obj]
          if (Array.isArray(obj)) {
            return obj.flatMap((v, i) => flatten(v, prefix ? `${prefix}[${i}]` : String(i)))
          }
          if (typeof obj === 'object') {
            return Object.entries(obj).flatMap(([k, v]) =>
              flatten(v, prefix ? `${prefix}.${k}` : k)
            )
          }
          return []
        }
        const parts = flatten(data)
        if (parts.length) msg = parts.join('; ')
      }
      setError(msg || 'Failed to plan trip')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="planner-container">
      <div className="planner-header">
        <div>
          <h1>Trip Planner</h1>
          <p className="planner-subtitle">
            Enter your route and current cycle hours to generate HOS‑compliant trip plans
          </p>
        </div>
        <button
          type="button"
          className="secondary-btn"
          onClick={handleLogout}
          aria-label="Log out"
        >
          Logout
        </button>
      </div>
      
      <div className="planner-layout">
        <section className="planner-panel planner-form-panel">
          <div className="panel-header">
            <div className="panel-header-row">
              <div>
                <h2>Plan Your Trip</h2>
                <p className="muted">Fill in the details below to generate your route plan</p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={handleLoadSaved}
                disabled={loading || loadingSaved || !accessToken}
              >
                {loadingSaved ? 'Loading saved trip…' : 'Load last saved trip'}
              </button>
            </div>
          </div>
          <TripForm
            onSubmit={handlePlanTrip}
            loading={loading}
            initialValues={savedFormValues ?? undefined}
          />
          {error && (
            <div className="error-message planner-error">
              {error}
            </div>
          )}
          {plan && (
            <div className="trip-summary">
              <h3>Trip Summary</h3>
              <div className="summary-cards">
                <div className="summary-card">
                  <div className="summary-icon">📍</div>
                  <div className="summary-content">
                    <div className="summary-label">Distance</div>
                    <div className="summary-value">{(plan.distance_m / 1609.34).toFixed(1)} miles</div>
                  </div>
                </div>
                <div className="summary-card">
                  <div className="summary-icon">⏱️</div>
                  <div className="summary-content">
                    <div className="summary-label">Duration</div>
                    <div className="summary-value">{(plan.duration_s / 3600).toFixed(1)} hours</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
        
        <section className="planner-panel planner-results-panel">
          {plan ? (
            <>
              <div className="panel-header">
                <h2>Route Map</h2>
                <p className="muted">Visual route from current location to dropoff</p>
              </div>
              <div className="map-wrapper">
                <MapView
                  geometry={plan.geometry}
                  waypoints={plan.waypoints ?? []}
                  currentLocation={savedFormValues?.current_location}
                  pickupLocation={savedFormValues?.pickup_location}
                  dropoffLocation={savedFormValues?.dropoff_location}
                />
              </div>
              
              <div className="panel-header" style={{ marginTop: '1rem' }}>
                <h2>Route Instructions</h2>
                <p className="muted">Step-by-step guidance for your trip (times shown as HH:MM)</p>
              </div>
              <div className="instructions-container">
                <ol className="instructions">
                  {mergeConsecutiveDrives(plan.instructions).map((line, idx) => {
                    const item = parseInstructionLine(line)
                    return (
                      <li key={idx}>
                        <span className="instruction-number">{idx + 1}</span>
                        <span className="instruction-text">
                          <span className="instruction-top">
                            {item.time ? <span className="instruction-time">{item.time}</span> : null}
                            <span className="instruction-title">{item.title}</span>
                          </span>
                          {item.detail ? <span className="instruction-detail">{item.detail}</span> : null}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </div>
              
              <div className="panel-header" style={{ marginTop: '1rem' }}>
                <div className="panel-header-row">
                  <div>
                    <h2>Daily Logs</h2>
                    <p className="muted">HOS compliance logs for each day</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() =>
                      navigate('/logbook', {
                        state: {
                          // Pass both the HOS plan and the original trip locations
                          plan: {
                            ...plan,
                            current_location: savedFormValues?.current_location,
                            pickup_location: savedFormValues?.pickup_location,
                            dropoff_location: savedFormValues?.dropoff_location,
                          },
                        },
                      })
                    }
                  >
                    View logs
                  </button>
                </div>
              </div>
              <div className="logs-scroll">
                {plan.logs.map((log) => (
                  <div key={log.date} className="log-item">
                    <div className="log-date-header">
                      <span className="log-date">{new Date(log.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                    <HosLog log={log} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🗺️</div>
              <h3>No Trip Planned</h3>
              <p className="muted">
                Plan a trip to see route instructions and ELD‑style daily logs here.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

