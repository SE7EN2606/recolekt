import React, { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Navigation, BookmarkCheck, Search } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData, LocationPlace } from '../context/DataContext'

/* ── Leaflet numbered icon (red for saved places page) ───────────────────── */
function createIcon(num: number, active: boolean): L.DivIcon {
  const bg = active ? '#dc2626' : '#ef4444'
  const size = active ? 30 : 24
  const half = size / 2
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="width:${size}px;height:${size}px;background:${bg};color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:${active ? 13 : 11}px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${num}</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -(half + 4)],
  })
}

/* ── Auto-fit map bounds ─────────────────────────────────────────────────── */
const BoundsFitter: React.FC<{ places: LocationPlace[] }> = ({ places }) => {
  const map = useMap()
  const fitted = React.useRef(false)

  React.useEffect(() => {
    fitted.current = false
  }, [places.length])

  React.useEffect(() => {
    if (fitted.current) return
    const withCoords = places.filter((p) => p.lat && p.lng)
    if (withCoords.length === 0) return
    fitted.current = true

    if (withCoords.length === 1) {
      map.flyTo([withCoords[0].lat!, withCoords[0].lng!], 13, { duration: 1 })
      return
    }
    const bounds = L.latLngBounds(withCoords.map((p) => [p.lat!, p.lng!]))
    map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 14, duration: 1 })
  }, [places, map])

  return null
}

/* ── Component ───────────────────────────────────────────────────────────── */
export const SavedPlaces: React.FC = () => {
  const navigate = useNavigate()
  const { savedPlaces, toggleSavedPlace } = useData()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  /* Filter by search */
  const filteredPlaces = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return savedPlaces
    return savedPlaces.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.type?.toLowerCase().includes(q) ||
        p.country?.toLowerCase().includes(q),
    )
  }, [savedPlaces, searchQuery])

  const handleSelect = useCallback((idx: number) => {
    setActiveIdx((prev) => (prev === idx ? null : idx))
  }, [])

  const handleUnsave = useCallback(
    async (e: React.MouseEvent, place: LocationPlace) => {
      e.stopPropagation()
      await toggleSavedPlace(place)
      setActiveIdx(null)
    },
    [toggleSavedPlace],
  )

  const mapsUrl = (p: LocationPlace) => {
    if (p.lat && p.lng) {
      return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
    }
    const q = [p.address, p.city, p.country].filter(Boolean).join(', ') || p.name
    return `https://maps.google.com/?q=${encodeURIComponent(q)}`
  }

  const buildSubtitle = (p: LocationPlace) => {
    const parts = [p.type, p.city, p.country].filter(Boolean)
    return parts.join(' · ')
  }

  const initialCenter: [number, number] = [20, 0]

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
          {savedPlaces.length > 0 && (
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm">
              {savedPlaces.length}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Search places, cities, types…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>

        {/* Map */}
        {filteredPlaces.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="h-72 w-full">
              <MapContainer
                center={initialCenter}
                zoom={2}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution="© Google Maps"
                  url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                />
                <BoundsFitter places={filteredPlaces} />

                {filteredPlaces.map((p, idx) =>
                  p.lat && p.lng ? (
                    <Marker
                      key={`${p._vid}-${p._idx}-${idx}`}
                      position={[p.lat, p.lng]}
                      icon={createIcon(idx + 1, activeIdx === idx)}
                      eventHandlers={{ click: () => handleSelect(idx) }}
                    >
                      <Popup closeButton={false} className="recolekt-popup">
                        <div style={{ minWidth: 180, maxWidth: 240 }}>
                          <p className="font-bold text-gray-900 text-sm mb-0.5">{p.name}</p>
                          {p.description && (
                            <p className="text-xs text-gray-600 mb-1 leading-relaxed">
                              {p.description}
                            </p>
                          )}
                          {buildSubtitle(p) && (
                            <p className="text-xs text-red-500 font-medium mb-2">
                              {buildSubtitle(p)}
                            </p>
                          )}
                          <button
                            onClick={() =>
                              window.open(mapsUrl(p), '_blank', 'noopener,noreferrer')
                            }
                            className="w-full h-8 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-blue-700 transition-colors"
                          >
                            <Navigation size={12} />
                            Directions
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ) : null,
                )}
              </MapContainer>
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
                {savedPlaces.length === 0
                  ? 'Tap the bookmark icon on any place in a video to save it here.'
                  : 'No places match your search.'}
              </p>
            </div>
          ) : (
            filteredPlaces.map((p, idx) => {
              const isActive = activeIdx === idx
              return (
                <div
                  key={`${p._vid}-${p._idx}-${idx}`}
                  onClick={() => handleSelect(idx)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                    isActive
                      ? 'border-red-200 bg-red-50/30 shadow-md'
                      : 'border-gray-100 bg-white hover:border-red-100 hover:bg-red-50/20 shadow-sm'
                  }`}
                >
                  {/* Number badge */}
                  <div
                    className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ${
                      isActive ? 'bg-red-600' : 'bg-red-500'
                    }`}
                  >
                    {idx + 1}
                  </div>

                  {/* Name + subtitle */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-900 truncate text-sm">{p.name}</h4>
                    {p.description ? (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{p.description}</p>
                    ) : null}
                    {buildSubtitle(p) && (
                      <p className="text-xs text-red-500 font-medium truncate">
                        {buildSubtitle(p)}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => handleUnsave(e, p)}
                      title="Remove from saved"
                      className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                    >
                      <BookmarkCheck size={18} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(mapsUrl(p), '_blank', 'noopener,noreferrer')
                      }}
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