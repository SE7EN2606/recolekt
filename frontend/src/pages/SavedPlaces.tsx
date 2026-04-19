import React, { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Navigation, BookmarkCheck, Search } from 'lucide-react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import { useData } from '../context/DataContext'

const GMAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_KEY ?? ''

interface LocationItem {
  name: string
  address?: string
  neighborhood?: string
  city?: string
  type?: string
  category?: string
  lat?: number
  lng?: number
  _vid?: string
  _idx?: number
}

// ─── localStorage helpers ──────────────────────────────────────────────────────
const PINNED_KEY = 'rekolektpinnedlocations'
function getPinnedMap(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) ?? '{}') } catch { return {} }
}
function setPinnedMap(map: Record<string, boolean>) {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(map)) } catch {}
}

// ─── Custom marker icon ───────────────────────────────────────────────────────
function makeIcon(num: number, active: boolean): google.maps.Icon {
  const size = active ? 30 : 24
  const half = size / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${half}" cy="${half}" r="${half - 1.5}"
      fill="${active ? '#dc2626' : '#ef4444'}"
      stroke="white" stroke-width="2"/>
    <text x="50%" y="50%" dy="0.36em"
      font-family="system-ui,sans-serif"
      font-size="${active ? 13 : 11}"
      font-weight="bold" fill="white" text-anchor="middle">${num}</text>
  </svg>`
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size) as google.maps.Size,
    anchor: new google.maps.Point(half, half) as google.maps.Point,
  }
}

export const SavedPlaces: React.FC = () => {
  const navigate = useNavigate()
  const ctx = useData() as any
  const videos: any[] = Array.isArray(ctx?.videos) ? ctx.videos : []

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GMAPS_KEY,
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [activeLocation, setActiveLocation] = useState<LocationItem | null>(null)
  const [openInfoIdx, setOpenInfoIdx] = useState<number | null>(null)
  // track keys removed during this session so UI updates immediately
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set())
  const [map, setMap] = useState<google.maps.Map | null>(null)

  const onLoadMap = useCallback((m: google.maps.Map) => setMap(m), [])
  const onUnmountMap = useCallback(() => setMap(null), [])

  // ── Collect all saved (pinned) places from videos ──────────────────────────
  const allPlaces = useMemo<LocationItem[]>(() => {
    const pinnedMap = getPinnedMap()
    const result: LocationItem[] = []

    videos.forEach((v: any) => {
      const vid: string = v?.id ?? v?.processid ?? ''
      if (!vid) return

      // Parse location from the correct field: v.location (singular)
      let locs: any[] = []
      const raw = v?.location
      if (typeof raw === 'string') {
        try { locs = JSON.parse(raw) } catch {}
      } else if (Array.isArray(raw)) {
        locs = raw
      } else if (raw && typeof raw === 'object') {
        locs = [raw]
      }

      locs.forEach((loc: any, i: number) => {
        if (!loc?.name) return
        const key = `${vid}:${i}`
        if (pinnedMap[key]) {
          result.push({ ...loc, _vid: vid, _idx: i })
        }
      })
    })

    return result
  }, [videos])

  // Filter out session-removed keys and search query
  const visiblePlaces = useMemo(
    () => allPlaces.filter(p => !removedKeys.has(`${p._vid}:${p._idx}`)),
    [allPlaces, removedKeys]
  )

  const filteredPlaces = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return visiblePlaces
    return visiblePlaces.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.city?.toLowerCase().includes(q) ||
      p.type?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    )
  }, [visiblePlaces, searchQuery])

  const handleUnsave = useCallback((e: React.MouseEvent, p: LocationItem) => {
    e.stopPropagation()
    const key = `${p._vid}:${p._idx}`
    const pins = getPinnedMap()
    delete pins[key]
    setPinnedMap(pins)
    setRemovedKeys(prev => new Set([...prev, key]))
    if (activeLocation?.name === p.name) setActiveLocation(null)
  }, [activeLocation])

  const handleSelectPlace = useCallback((loc: LocationItem, idx: number) => {
    setActiveLocation(loc)
    setOpenInfoIdx(idx)
    if (loc.lat && loc.lng && map) {
      map.panTo({ lat: loc.lat, lng: loc.lng })
      map.setZoom(15)
    }
  }, [map])

  const center: google.maps.LatLngLiteral =
    filteredPlaces[0]?.lat && filteredPlaces[0]?.lng
      ? { lat: filteredPlaces[0].lat, lng: filteredPlaces[0].lng }
      : { lat: 48.8566, lng: 2.3522 }

  const mapsUrl = (loc: LocationItem) => {
    const q = [loc.address, loc.neighborhood, loc.city].filter(Boolean).join(', ') || loc.name
    return `https://maps.google.com/?q=${encodeURIComponent(q)}`
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200/50">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-900" />
            </button>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Saved Places</h1>
          </div>
          {visiblePlaces.length > 0 && (
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm">
              {visiblePlaces.length}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search places, cities, or types…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
          />
        </div>

        {/* Map */}
        {filteredPlaces.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div style={{ height: 320, width: '100%' }}>
              {isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={center}
                  zoom={12}
                  onLoad={onLoadMap}
                  onUnmount={onUnmountMap}
                  options={{
                    zoomControl: true,
                    scrollwheel: false,
                    gestureHandling: 'cooperative',
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    clickableIcons: false,
                  }}
                >
                  {filteredPlaces.map((loc, idx) =>
                    loc.lat && loc.lng ? (
                      <Marker
                        key={`${loc.name}-${idx}`}
                        position={{ lat: loc.lat, lng: loc.lng }}
                        icon={isLoaded ? makeIcon(idx + 1, activeLocation?.name === loc.name) : undefined}
                        onClick={() => handleSelectPlace(loc, idx)}
                      >
                        {openInfoIdx === idx && (
                          <InfoWindow onCloseClick={() => { setOpenInfoIdx(null); setActiveLocation(null) }}>
                            <div style={{ fontFamily: 'system-ui, sans-serif', minWidth: 140 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: '#111', marginBottom: 3 }}>
                                {loc.name}
                              </div>
                              <div style={{ fontSize: 11, color: '#666' }}>
                                {[loc.type || loc.category, loc.city].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          </InfoWindow>
                        )}
                      </Marker>
                    ) : null
                  )}
                </GoogleMap>
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                  <span className="text-gray-400 text-sm animate-pulse">Loading map…</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-3">
          {filteredPlaces.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin size={24} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">No places saved</h3>
              <p className="text-gray-500 text-sm">
                {allPlaces.length === 0
                  ? 'Tap the bookmark icon on any place in a video to save it here.'
                  : 'No places match your search.'}
              </p>
            </div>
          ) : (
            filteredPlaces.map((loc, idx) => {
              const isActive = activeLocation?.name === loc.name && activeLocation?.address === loc.address
              return (
                <div
                  key={`${loc.name}-${idx}`}
                  onClick={() => handleSelectPlace(loc, idx)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                    isActive
                      ? 'border-red-200 bg-red-50/30 shadow-md'
                      : 'border-gray-100 bg-white hover:border-red-100 hover:bg-red-50/20 shadow-sm'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ${
                      isActive ? 'bg-red-600' : 'bg-red-500'
                    }`}
                  >
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-900 truncate text-sm">{loc.name}</h4>
                    <p className="text-xs text-gray-500 truncate">
                      {[loc.type || loc.category, loc.address || loc.neighborhood, loc.city]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => handleUnsave(e, loc)}
                      title="Remove from saved"
                      className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary-50 text-primary-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <BookmarkCheck size={18} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); window.open(mapsUrl(loc), '_blank') }}
                      className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors"
                    >
                      <Navigation size={18} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default SavedPlaces