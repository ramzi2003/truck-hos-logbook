import { type FormEvent, useEffect, useState } from 'react'
import { LocationAutocomplete } from './LocationAutocomplete'

type TripFormValues = {
  current_location: string
  pickup_location: string
  dropoff_location: string
  current_cycle_hours_used: number
}

type TripFormProps = {
  onSubmit: (values: TripFormValues) => void
  loading: boolean
  /** Optional: pre-fill the form when loading a saved trip. */
  initialValues?: Partial<TripFormValues>
}

export function TripForm({ onSubmit, loading, initialValues }: TripFormProps) {
  const [currentLocation, setCurrentLocation] = useState(initialValues?.current_location ?? '')
  const [pickupLocation, setPickupLocation] = useState(initialValues?.pickup_location ?? '')
  const [dropoffLocation, setDropoffLocation] = useState(initialValues?.dropoff_location ?? '')
  const [cycleUsed, setCycleUsed] = useState(
    initialValues?.current_cycle_hours_used ?? 0
  )

  // When the caller provides new initial values (e.g. after loading a saved trip),
  // sync them into the controlled inputs so the left‑hand form is populated.
  useEffect(() => {
    if (!initialValues) return
    setCurrentLocation(initialValues.current_location ?? '')
    setPickupLocation(initialValues.pickup_location ?? '')
    setDropoffLocation(initialValues.dropoff_location ?? '')
    setCycleUsed(initialValues.current_cycle_hours_used ?? 0)
  }, [
    initialValues?.current_location,
    initialValues?.pickup_location,
    initialValues?.dropoff_location,
    initialValues?.current_cycle_hours_used,
  ])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const raw = Number(cycleUsed)
    const current_cycle_hours_used = Number.isFinite(raw)
      ? Math.max(0, Math.min(70, raw))
      : 0
    onSubmit({
      current_location: currentLocation,
      pickup_location: pickupLocation,
      dropoff_location: dropoffLocation,
      current_cycle_hours_used,
    })
  }

  return (
    <form className="form vertical trip-form" onSubmit={handleSubmit}>
      <label>
        <span>Current location</span>
        <LocationAutocomplete
          value={currentLocation}
          onChange={setCurrentLocation}
          placeholder="Enter your current location"
          required
        />
      </label>
      <label>
        <span>Pickup location</span>
        <LocationAutocomplete
          value={pickupLocation}
          onChange={setPickupLocation}
          placeholder="Enter pickup address"
          required
        />
      </label>
      <label>
        <span>Dropoff location</span>
        <LocationAutocomplete
          value={dropoffLocation}
          onChange={setDropoffLocation}
          placeholder="Enter dropoff address"
          required
        />
      </label>
      <label>
        <span>Current cycle used (hours)</span>
        <input
          type="number"
          min={0}
          max={70}
          step={0.5}
          value={cycleUsed}
          onChange={(e) => {
            const v = e.target.value === '' ? 0 : Number(e.target.value)
            setCycleUsed(Number.isFinite(v) ? v : 0)
          }}
          placeholder="0"
        />
      </label>
      <button type="submit" className="primary-btn" disabled={loading}>
        {loading ? 'Planning trip…' : 'Plan Trip'}
      </button>
    </form>
  )
}

