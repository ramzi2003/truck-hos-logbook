import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

type Suggestion = {
  place_name: string
  center: [number, number] // [lon, lat]
}

type LocationAutocompleteProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  required,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<number | null>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchSuggestions(query: string) {
    if (!query.trim() || query.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setIsLoading(true)
    try {
      const response = await api.get('/trips/autocomplete/', {
        params: { q: query, limit: 5 },
      })
      setSuggestions(response.data.suggestions || [])
      setShowSuggestions(true)
    } catch (err) {
      console.error('Failed to fetch suggestions:', err)
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value
    onChange(newValue)

    // Debounce API calls
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = window.setTimeout(() => {
      fetchSuggestions(newValue)
    }, 300)
  }

  function handleSelectSuggestion(suggestion: Suggestion) {
    onChange(suggestion.place_name)
    setShowSuggestions(false)
    setSuggestions([])
    inputRef.current?.blur()
  }

  return (
    <div className="location-autocomplete-wrapper" ref={wrapperRef}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true)
        }}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {showSuggestions && (suggestions.length > 0 || isLoading) && (
        <div className="autocomplete-dropdown">
          {isLoading ? (
            <div className="autocomplete-item autocomplete-loading">Loading...</div>
          ) : (
            suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                className="autocomplete-item"
                onClick={() => handleSelectSuggestion(suggestion)}
              >
                {suggestion.place_name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
