import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

export type Waypoint = {
  type: 'start' | 'pickup' | 'dropoff' | 'fuel' | 'break' | 'end_of_day' | 'restart'
  lng: number
  lat: number
  label: string
}

type MapViewProps = {
  geometry: number[][] // Array of [lon, lat] coordinates
  waypoints?: Waypoint[]
  currentLocation?: string
  pickupLocation?: string
  dropoffLocation?: string
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const WAYPOINT_COLORS: Record<string, string> = {
  start: '#10b981',
  pickup: '#3b82f6',
  dropoff: '#ef4444',
  fuel: '#f59e0b',
  break: '#8b5cf6',
  end_of_day: '#6366f1',
  restart: '#ec4899',
}

const LEGEND_ITEMS: { type: keyof typeof WAYPOINT_COLORS; label: string }[] = [
  { type: 'start', label: 'Start' },
  { type: 'pickup', label: 'Pickup' },
  { type: 'dropoff', label: 'Drop-off' },
  { type: 'fuel', label: 'Fuel stop' },
  { type: 'break', label: 'Break' },
  { type: 'end_of_day', label: 'End of day' },
  { type: 'restart', label: '34-hour restart' },
]

export function MapView({ geometry, waypoints, currentLocation, pickupLocation, dropoffLocation }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) {
      console.warn('Mapbox token not set or container not available')
      return
    }

    if (!map.current) {
      mapboxgl.accessToken = MAPBOX_TOKEN

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: geometry.length > 0 ? [geometry[0][0], geometry[0][1]] : [-95.7129, 37.0902],
        zoom: 4,
      })

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    }

    const currentMap = map.current

    function updateRoute() {
      if (!geometry || geometry.length === 0) return

      const bounds = new mapboxgl.LngLatBounds()
      geometry.forEach((coord) => bounds.extend([coord[0], coord[1]]))

      // Remove existing markers
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      if (waypoints && waypoints.length > 0) {
        waypoints.forEach((wp) => {
          bounds.extend([wp.lng, wp.lat])
          const color = WAYPOINT_COLORS[wp.type] ?? '#6b7280'
          const marker = new mapboxgl.Marker({ color })
            .setLngLat([wp.lng, wp.lat])
            .setPopup(new mapboxgl.Popup().setText(wp.label))
            .addTo(currentMap)
          markersRef.current.push(marker)
        })
      } else {
        // Fallback: start + end from geometry (e.g. old saved trips without waypoints)
        if (geometry.length > 0) {
          const startMarker = new mapboxgl.Marker({ color: '#10b981' })
            .setLngLat([geometry[0][0], geometry[0][1]])
            .setPopup(new mapboxgl.Popup().setText(currentLocation || 'Start'))
            .addTo(currentMap)
          markersRef.current.push(startMarker)
          if (geometry.length > 1) {
            const endMarker = new mapboxgl.Marker({ color: '#ef4444' })
              .setLngLat([geometry[geometry.length - 1][0], geometry[geometry.length - 1][1]])
              .setPopup(new mapboxgl.Popup().setText(dropoffLocation || 'Dropoff'))
              .addTo(currentMap)
            markersRef.current.push(endMarker)
          }
        }
      }

      currentMap.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12,
      })

      // Update or add route source and layer
      if (currentMap.getSource('route')) {
        ;(currentMap.getSource('route') as mapboxgl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: geometry,
          },
        })
      } else {
        currentMap.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: geometry,
            },
          },
        })

        currentMap.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#0ea5e9',
            'line-width': 4,
          },
        })
      }
    }

    if (currentMap.loaded()) {
      updateRoute()
    } else {
      currentMap.on('load', updateRoute)
    }

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
    }
  }, [geometry, waypoints, currentLocation, pickupLocation, dropoffLocation])

  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="map-placeholder">
        <p>Mapbox token not configured. Please set VITE_MAPBOX_TOKEN in your .env file.</p>
      </div>
    )
  }

  return (
    <div className="map-view-wrapper">
      <div ref={mapContainer} className="map-container" />
      <div className="map-legend" aria-label="Map marker legend">
        <div className="map-legend-title">Markers</div>
        <ul className="map-legend-list">
          {LEGEND_ITEMS.map(({ type, label }) => (
            <li key={type} className="map-legend-item">
              <span
                className="map-legend-dot"
                style={{ backgroundColor: WAYPOINT_COLORS[type] ?? '#6b7280' }}
                aria-hidden
              />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
