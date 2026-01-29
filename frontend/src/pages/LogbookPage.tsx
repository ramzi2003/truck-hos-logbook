import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { LogbookSheet, type LogbookFormData, type RecapValues } from '../components/LogbookSheet'

type TripPlan = {
  distance_m: number
  duration_s: number
  geometry: number[][]
  stops: any[]
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
  // Trip-level locations from the original planner request.
  current_location?: string
  pickup_location?: string
  dropoff_location?: string
}

export function LogbookPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const statePlan = (location.state as any)?.plan as TripPlan | undefined

  const [plan, setPlan] = useState<TripPlan | null>(statePlan ?? null)
  const [loading, setLoading] = useState(!statePlan)
  const [error, setError] = useState<string | null>(null)
  const [formByDate, setFormByDate] = useState<Record<string, LogbookFormData>>({})
  const [savingDate, setSavingDate] = useState<string | null>(null)
  const [saveErrorByDate, setSaveErrorByDate] = useState<Record<string, string>>({})

  const title = useMemo(() => {
    if (!plan) return 'Logbook'
    return `Logbook (${plan.logs.length} day${plan.logs.length === 1 ? '' : 's'})`
  }, [plan])

  useEffect(() => {
    if (statePlan) return
    ;(async () => {
      setLoading(true)
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
        if (savedPlan) {
          setPlan({
            ...(savedPlan as TripPlan),
            trip_id: latest.id,
            current_location: detailRes.data?.current_location,
            pickup_location: detailRes.data?.pickup_location,
            dropoff_location: detailRes.data?.dropoff_location,
          })
        } else {
          setPlan(null)
        }
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Failed to load saved logbook')
      } finally {
        setLoading(false)
      }
    })()
  }, [statePlan])

  // Whenever we have a plan with a trip_id, load any saved logbook form data.
  useEffect(() => {
    if (!plan?.trip_id) return
    ;(async () => {
      try {
        const res = await api.get(`/trips/${plan.trip_id}/logbooks/`)
        const results = (res.data?.results || []) as {
          date: string
          form_data?: LogbookFormData
        }[]
        const byDate: Record<string, LogbookFormData> = {}
        for (const row of results) {
          if (row.date) {
            byDate[row.date] = (row as any).form_data || {}
          }
        }
        setFormByDate(byDate)
      } catch {
        // don't block the page if logbooks fail to load
      }
    })()
  }, [plan?.trip_id])

  /** Total driving + on-duty hours from segments (for recap calculations). */
  function getDrivingPlusOnDutyHours(
    segments: { status: string; start_iso: string; end_iso: string }[]
  ): number {
    let total = 0
    for (const seg of segments) {
      if (seg.status !== 'D' && seg.status !== 'ON') continue
      const start = new Date(seg.start_iso).getTime()
      const end = new Date(seg.end_iso).getTime()
      total += (end - start) / (1000 * 60 * 60)
    }
    return total
  }

  /** Driving-only hours from segments (for mileage apportionment). */
  function getDrivingHours(
    segments: { status: string; start_iso: string; end_iso: string }[]
  ): number {
    let total = 0
    for (const seg of segments) {
      if (seg.status !== 'D') continue
      const start = new Date(seg.start_iso).getTime()
      const end = new Date(seg.end_iso).getTime()
      total += (end - start) / (1000 * 60 * 60)
    }
    return total
  }

  /** Recap values for one day given per-day on-duty hours (D+ON) for the whole trip. */
  function getRecapForDay(hoursByDay: number[], dayIndex: number): RecapValues {
    const onDutyToday = hoursByDay[dayIndex] ?? 0
    const i = dayIndex
    const n = hoursByDay.length
    const sum = (a: number, b: number) => {
      let s = 0
      for (let j = a; j <= b; j++) if (j >= 0 && j < n) s += hoursByDay[j]
      return s
    }
    const seventyA = sum(Math.max(0, i - 6), i)
    const seventyC = sum(Math.max(0, i - 7), i)
    const seventyB = Math.max(0, 70 - seventyA)
    const sixtyA = sum(Math.max(0, i - 4), i)
    const sixtyC = sum(Math.max(0, i - 6), i)
    const sixtyB = Math.max(0, 60 - sixtyA)
    return {
      onDutyToday,
      seventyA,
      seventyB,
      seventyC,
      sixtyA,
      sixtyB,
      sixtyC,
    }
  }

  function updateField(date: string, field: keyof LogbookFormData, value: string) {
    setFormByDate((prev) => ({
      ...prev,
      [date]: {
        ...(prev[date] || {}),
        [field]: value,
      },
    }))
  }

  async function handleSave(e: FormEvent, date: string) {
    e.preventDefault()
    if (!plan?.trip_id) return
    const currentForm = formByDate[date] || {}
    setSavingDate(date)
    setSaveErrorByDate((prev) => ({ ...prev, [date]: '' }))
    try {
      await api.post(`/trips/${plan.trip_id}/logbooks/`, {
        date,
        index: 1,
        form_data: currentForm,
      })
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to save logbook'
      setSaveErrorByDate((prev) => ({ ...prev, [date]: msg }))
    } finally {
      setSavingDate(null)
    }
  }

  return (
    <div className="planner-container">
      <div className="planner-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h1>{title}</h1>
            <p className="planner-subtitle">Driver daily logs (ELD-style)</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="secondary-btn" onClick={() => navigate('/planner', { replace: false })}>
              Back to planner
            </button>
          </div>
        </div>
      </div>

      <div
        className="planner-panel"
        style={{
          background: 'transparent',
          boxShadow: 'none',
          padding: 0,
          borderRadius: 0,
        }}
      >
        {loading ? (
          <div className="empty-state" style={{ minHeight: 200 }}>
            <h3>Loading…</h3>
          </div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : !plan ? (
          <div className="empty-state" style={{ minHeight: 200 }}>
            <h3>No saved trip yet</h3>
            <p className="muted">Plan a trip first, then come back to view the logbook.</p>
          </div>
        ) : (
          <div className="logbook-scroll">
            {(() => {
              const hoursByDay = plan.logs.map((l) => getDrivingPlusOnDutyHours(l.segments))
              const totalMiles = plan.distance_m / 1609.34
              const totalDriveHours = plan.logs.reduce(
                (sum, l) => sum + getDrivingHours(l.segments),
                0
              )
              return plan.logs.map((log, dayIndex) => {
                const form = formByDate[log.date] || {}
                // Per-day miles by actual drive time: (drive hours this day / total drive hours) * total miles.
                const driveHoursThisDay = getDrivingHours(log.segments)
                const perDayMiles =
                  totalDriveHours > 0
                    ? (driveHoursThisDay / totalDriveHours) * totalMiles
                    : totalMiles
                const milesText = perDayMiles.toFixed(1)
                // Use trip-level locations for the From/To header on the left sheet,
                // instead of asking the driver again in the right-hand form.
                const sheetForm: LogbookFormData = {
                  ...form,
                  from_location: plan.current_location ?? form.from_location,
                  to_location: plan.dropoff_location ?? form.to_location,
                  total_miles_driving_today: milesText,
                  total_mileage_today: milesText,
                }
                const recapValues = getRecapForDay(hoursByDay, dayIndex)
                const saveError = saveErrorByDate[log.date]
                const isSaving = savingDate === log.date
                return (
                  <div
                    key={log.date}
                    style={{
                      display: 'flex',
                      gap: '1.75rem',
                      alignItems: 'flex-start',
                      marginBottom: '2.5rem',
                    }}
                  >
                    <div className="logbook-sheet-wrapper">
                      <LogbookSheet
                        dateText={new Date(log.date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                        log={log}
                        formData={sheetForm}
                        recapValues={recapValues}
                      />
                    </div>

                  {/* Questions for this specific logbook day, visually to the right of the Letter page */}
                  <form
                    onSubmit={(e) => handleSave(e, log.date)}
                    style={{
                      flex: '0 0 380px',
                      padding: '1rem 1.25rem',
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.06)',
                      background: '#fff',
                    }}
                  >
                    <h2 style={{ marginBottom: '0.75rem' }}>
                      Day details – {new Date(log.date).toLocaleDateString('en-US')}
                    </h2>
                    <p className="muted" style={{ marginBottom: '1rem' }}>
                      These details are written into the Drivers Daily Log on the left.
                    </p>

                    <div className="field">
                      <label>Truck / tractor and trailer numbers</label>
                      <input
                        type="text"
                        value={form.truck_numbers ?? ''}
                        onChange={(e) => updateField(log.date, 'truck_numbers', e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Name of carrier or carriers</label>
                      <input
                        type="text"
                        value={form.carrier_name ?? ''}
                        onChange={(e) => updateField(log.date, 'carrier_name', e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Main office address</label>
                      <input
                        type="text"
                        value={form.main_office_address ?? ''}
                        onChange={(e) =>
                          updateField(log.date, 'main_office_address', e.target.value)
                        }
                      />
                    </div>

                    <div className="field">
                      <label>Home terminal address</label>
                      <input
                        type="text"
                        value={form.home_terminal_address ?? ''}
                        onChange={(e) =>
                          updateField(log.date, 'home_terminal_address', e.target.value)
                        }
                      />
                    </div>

                    {/* Shipping Documents question card */}
                    <div
                      style={{
                        marginTop: '1.5rem',
                        padding: '1rem 1.25rem',
                        borderRadius: 8,
                        border: '1px solid rgba(0,0,0,0.08)',
                        background: 'rgba(0,0,0,0.02)',
                      }}
                    >
                      <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                        Shipping Documents
                      </h3>
                      <div style={{ height: 1, background: 'rgba(0,0,0,0.12)', marginBottom: '1rem' }} />
                      <div className="field">
                        <label>DVL or Manifest No.</label>
                        <input
                          type="text"
                          value={form.dvl_or_manifest_no ?? ''}
                          onChange={(e) =>
                            updateField(log.date, 'dvl_or_manifest_no', e.target.value)
                          }
                        />
                      </div>
                      <p className="muted" style={{ textAlign: 'center', margin: '0.5rem 0', fontSize: '0.875rem' }}>
                        or
                      </p>
                      <div className="field">
                        <label>Shipper & Commodity</label>
                        <input
                          type="text"
                          value={form.shipper_and_commodity ?? ''}
                          onChange={(e) =>
                            updateField(log.date, 'shipper_and_commodity', e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="field" style={{ marginTop: '1rem' }}>
                      <label>Staying in Sleeper Berth?</label>
                      <div
                        role="group"
                        aria-label="Staying in Sleeper Berth?"
                        style={{
                          display: 'flex',
                          borderRadius: '0.5rem',
                          overflow: 'hidden',
                          width: '100%',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => updateField(log.date, 'ending_shift_location', 'no')}
                          style={{
                            flex: 1,
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.9rem',
                            border: 'none',
                            outline: 'none',
                            background: (form.ending_shift_location ?? 'no') === 'no' ? '#0ea5e9' : '#fff',
                            color: (form.ending_shift_location ?? 'no') === 'no' ? '#fff' : '#334155',
                            cursor: 'pointer',
                            fontWeight: (form.ending_shift_location ?? 'no') === 'no' ? 600 : 400,
                            transition: 'background 0.25s ease, color 0.25s ease, font-weight 0.25s ease',
                          }}
                        >
                          No
                        </button>
                        <button
                          type="button"
                          onClick={() => updateField(log.date, 'ending_shift_location', 'yes')}
                          style={{
                            flex: 1,
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.9rem',
                            border: 'none',
                            outline: 'none',
                            background: (form.ending_shift_location ?? 'no') === 'yes' ? '#0ea5e9' : '#fff',
                            color: (form.ending_shift_location ?? 'no') === 'yes' ? '#fff' : '#334155',
                            cursor: 'pointer',
                            fontWeight: (form.ending_shift_location ?? 'no') === 'yes' ? 600 : 400,
                            transition: 'background 0.25s ease, color 0.25s ease, font-weight 0.25s ease',
                          }}
                        >
                          Yes
                        </button>
                      </div>
                    </div>

                    {(form.ending_shift_location ?? 'no') === 'yes' && (
                      <div className="field" style={{ marginTop: '0.75rem' }}>
                        <label>At what time?</label>
                        <input
                          type="time"
                          value={form.sleeper_berth_time ?? ''}
                          onChange={(e) =>
                            updateField(log.date, 'sleeper_berth_time', e.target.value)
                          }
                        />
                      </div>
                    )}

                    {saveError && (
                      <p className="error-message" style={{ marginTop: '0.5rem' }}>
                        {saveError}
                      </p>
                    )}

                    <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
                      <button className="primary-btn" type="submit" disabled={isSaving}>
                        {isSaving ? 'Updating…' : 'Update logbook'}
                      </button>
                    </div>
                  </form>
                </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

