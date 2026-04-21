/**
 * LocationCard.tsx
 *
 * Uses react-leaflet + Google Maps tile layer.
 * - flyTo via useMap on place click (MapController)
 * - BoundsFitter: auto-fits map to all resolved markers after geocoding
 * - Blue #2563eb numbered circle markers
 * - Geocodes missing lat/lng via /api/geocode proxy
 * - PATCHes resolved coords to Neon DB once — next load skips Nominatim
 * - Clicking a card: flies map to pin + opens Leaflet Popup on the marker
 * - Clicking list row: flies to pin and opens popup
 * - Save/bookmark button toggles savedPlaces via DataContext (optimistic + NeonDB)
 *
 * Subtitle priority: description (from LLM) > city/region/country > type
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react';
import { useData } from '../context/DataContext';

/* ── Local types ─────────────────────────────────────────────────────────── */

export interface LocationPlace {
  id?: string;
  name: string;
  type?: string;
  city?: string;
  region?: string;
  country?: string;
  address?: string;
  neighborhood?: string;
  description?: string;
  instagram?: string;
  emoji?: string;
  rank?: number;
  lat?: number | null;
  lng?: number | null;
}

interface GeocodedPlace extends LocationPlace {
  _idx: number;
  coords: [number, number] | null;
  geocodeStatus: 'idle' | 'loading' | 'done' | 'failed';
}

export interface LocationCardProps {
  locations: LocationPlace[];
  videoId?: string;
}

/* ── Config ──────────────────────────────────────────────────────────────── */

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? 'http://localhost:5001';

const COUNTRY_CODES: Record<string, string> = {
  italy: 'it', france: 'fr', spain: 'es', germany: 'de',
  japan: 'jp', usa: 'us', 'united states': 'us',
  uk: 'gb', 'united kingdom': 'gb', scotland: 'gb',
  portugal: 'pt', greece: 'gr', croatia: 'hr',
  thailand: 'th', mexico: 'mx', brazil: 'br',
  australia: 'au', canada: 'ca', switzerland: 'ch',
  austria: 'at', netherlands: 'nl', turkey: 'tr',
  ukraine: 'ua', poland: 'pl', czechia: 'cz',
  morocco: 'ma', indonesia: 'id', vietnam: 'vn',
  india: 'in', china: 'cn', sweden: 'se',
  norway: 'no', denmark: 'dk', finland: 'fi',
  ireland: 'ie', 'new zealand': 'nz', argentina: 'ar',
  colombia: 'co', peru: 'pe', chile: 'cl',
};

/* ── Auth token ──────────────────────────────────────────────────────────── */

function getToken(): string {
  try {
    return (window as any).__REKOLEKT_TOKEN__ ?? localStorage.getItem('auth_token') ?? '';
  } catch {
    return '';
  }
}

/* ── Nominatim proxy ─────────────────────────────────────────────────────── */

async function geocodeViaProxy(
  name: string,
  region?: string,
  country?: string,
): Promise<[number, number] | null> {
  const cc = country ? (COUNTRY_CODES[country.toLowerCase()] ?? '') : '';
  const queries: string[] = region ? [`${name}, ${region}`, name] : [name];
  const token = getToken();

  for (const q of queries) {
    try {
      const params = new URLSearchParams({ q });
      if (cc) params.set('countrycodes', cc);
      const res = await fetch(`${API_BASE}/api/geocode?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (typeof data?.lat === 'number' && typeof data?.lng === 'number') {
        return [data.lat, data.lng];
      }
    } catch {
      continue;
    }
  }
  return null;
}

/* ── Persist coords to Neon (fire-and-forget) ────────────────────────────── */

async function persistLocationCoords(
  videoId: string,
  locations: LocationPlace[],
): Promise<LocationPlace[] | null> {
  const token = getToken();
  const payload = locations.map((p) => ({
    name: p.name,
    type: p.type,
    city: p.city,
    region: p.region,
    country: p.country,
    address: p.address ?? null,
    neighborhood: p.neighborhood ?? null,
    description: p.description ?? null,
    instagram: p.instagram ?? null,
    emoji: p.emoji ?? null,
    rank: p.rank ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
  }));

  try {
    const res = await fetch(`${API_BASE}/api/reel/${videoId}/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ location: payload }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Backend returns enriched location array with resolved coords
    return Array.isArray(data.location) ? data.location : null;
  } catch {
    return null;
  }
}

/* ── Leaflet numbered icon ───────────────────────────────────────────────── */

function createCustomIcon(number: number, active = false): L.DivIcon {
  const bg = active ? '#1d4ed8' : '#2563eb';
  const size = active ? 30 : 24;
  const offset = size / 2;
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="width:${size}px;height:${size}px;background-color:${bg};color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:${active ? 13 : 11}px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);transition:all .2s;">${number}</div>`,
    iconSize: [size, size] as [number, number],
    iconAnchor: [offset, offset] as [number, number],
    popupAnchor: [0, -(offset + 4)] as [number, number],
  });
}

/* ── Location line helper ────────────────────────────────────────────────── */

function buildLocationLine(p: LocationPlace): string {
  const parts = [p.city, p.region, p.country].filter(Boolean);
  const deduped = parts.filter((v, i) => i === 0 || v !== parts[i - 1]);
  return deduped.join(', ');
}

/* ── MapController: flyTo on place click ────────────────────────────────── */

const MapController = ({ activeLoc }: { activeLoc: GeocodedPlace | null }) => {
  const map = useMap();
  useEffect(() => {
    if (activeLoc?.coords) {
      map.flyTo(activeLoc.coords, 15, { duration: 1.2 });
    }
  }, [activeLoc, map]);
  return null;
};

/* ── BoundsFitter ────────────────────────────────────────────────────────── */

const BoundsFitter = ({
  places,
  active,
  locationsKey,
}: {
  places: GeocodedPlace[];
  active: GeocodedPlace | null;
  locationsKey: string;
}) => {
  const map = useMap();
  const lastFitSignatureRef = useRef<string | null>(null);

  const resolved = useMemo(() => places.filter((p) => p.coords !== null), [places]);

  const resolvedSignature = useMemo(() => {
    return `${locationsKey}::${resolved
      .map((p) => `${p._idx}:${p.coords?.[0] ?? 'x'},${p.coords?.[1] ?? 'x'}`)
      .join('|')}`;
  }, [locationsKey, resolved]);

  useEffect(() => {
    lastFitSignatureRef.current = null;
  }, [locationsKey]);

  useEffect(() => {
    if (active) return;
    if (resolved.length === 0) return;
    if (lastFitSignatureRef.current === resolvedSignature) return;
    lastFitSignatureRef.current = resolvedSignature;

    if (resolved.length === 1) {
      map.flyTo(resolved[0].coords!, 13, { duration: 1.2 });
      return;
    }

    const bounds = L.latLngBounds(resolved.map((p) => p.coords!));
    map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 14, duration: 1.2 });
  }, [active, resolved, resolvedSignature, map]);

  return null;
};

/* ── Popup inner content (rendered inside Leaflet Popup) ─────────────────── */

const PopupContent: React.FC<{
  place: GeocodedPlace;
  isSaved: boolean;
  onSave: (e: React.MouseEvent) => void;
}> = ({ place, isSaved, onSave }) => {
  const locationLine = buildLocationLine(place);
  const mapsUrl = place.coords
    ? `https://www.google.com/maps/dir/?api=1&destination=${place.coords[0]},${place.coords[1]}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${place.name} ${place.city ?? ''}`,
      )}`;

  return (
    <div style={{ minWidth: 210, maxWidth: 260 }}>
      {/* Name row */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-bold text-gray-900 text-sm leading-tight flex-1">{place.name}</span>
        <button
          onClick={onSave}
          className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            isSaved ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
          }`}
          aria-label={isSaved ? 'Remove bookmark' : 'Save place'}
        >
          {isSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
        </button>
      </div>

      {/* Type badge */}
      {place.type && (
        <p className="text-xs text-gray-400 mb-1">{place.type}</p>
      )}

      {/* Description (the good stuff) */}
      {place.description && (
        <p className="text-xs text-gray-600 leading-relaxed mb-2">{place.description}</p>
      )}

      {/* Location line */}
      {locationLine && (
        <p className="text-xs text-blue-500 font-medium mb-2">{locationLine}</p>
      )}

      {/* Address */}
      {place.address && (
        <p className="text-xs text-gray-400 mb-2 flex items-start gap-1">
          <MapPin size={10} className="mt-0.5 shrink-0" />
          {place.address}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
          className="flex-1 h-8 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-blue-700 transition-colors"
        >
          <Navigation size={12} />
          Directions
        </button>

        {place.instagram && (
          <a
            href={place.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium flex items-center gap-1 hover:bg-gray-200 transition-colors"
          >
            <ExternalLink size={12} />
            IG
          </a>
        )}
      </div>
    </div>
  );
};

/* ── Main component ──────────────────────────────────────────────────────── */

export const LocationCard: React.FC<LocationCardProps> = ({ locations, videoId }) => {
  const ctx = useData() as any;
  const savedPlaces: LocationPlace[] = ctx.savedPlaces ?? [];
  const toggleSavedPlace: (place: LocationPlace) => void =
    ctx.toggleSavedPlace ?? (() => {});

  const [places, setPlaces] = useState<GeocodedPlace[]>([]);
  const [activeLocation, setActiveLocation] = useState<GeocodedPlace | null>(null);

  const persistedRef = useRef(false);
  const geocodingKeyRef = useRef<string | null>(null);

  // Refs to programmatically open Leaflet popups
  const markerRefs = useRef<Map<number, L.Marker>>(new Map());

  const locationsKey = useMemo(
    () =>
      locations
        .map((l) => `${l.name}|${l.city ?? ''}|${l.region ?? ''}|${l.country ?? ''}`)
        .join('||'),
    [locations],
  );

  useEffect(() => {
    if (!locations?.length) return;
    if (geocodingKeyRef.current === locationsKey) return;
    geocodingKeyRef.current = locationsKey;

    persistedRef.current = false;
    setActiveLocation(null);
    markerRefs.current.clear();

    const initial: GeocodedPlace[] = locations.map((loc, i) => ({
      ...loc,
      _idx: i,
      coords:
        loc.lat != null && loc.lng != null
          ? ([Number(loc.lat), Number(loc.lng)] as [number, number])
          : null,
      geocodeStatus: loc.lat != null && loc.lng != null ? 'done' : 'idle',
    }));

    setPlaces(initial);

    if (!initial.some((p) => p.geocodeStatus === 'idle')) return;
    if (!videoId) return;

    let cancelled = false;

    // Mark all idle as loading immediately so the UI shows progress
    const loading = initial.map((p) =>
      p.geocodeStatus === 'idle' ? { ...p, geocodeStatus: 'loading' as const } : p,
    );
    setPlaces(loading);

    (async () => {
      // Single backend call — server geocodes all missing coords and returns enriched array
      const enriched = await persistLocationCoords(videoId, locations);
      if (cancelled || !enriched) return;

      const resolved = initial.map((p, i) => {
        const loc = enriched[i];
        if (!loc) return { ...p, geocodeStatus: 'failed' as const };
        const coords: [number, number] | null =
          typeof loc.lat === 'number' && typeof loc.lng === 'number'
            ? [loc.lat, loc.lng]
            : null;
        return {
          ...p,
          coords,
          geocodeStatus: (coords ? 'done' : 'failed') as 'done' | 'failed',
        };
      });
      setPlaces(resolved);
    })();

    return () => {
      cancelled = true;
    };
  }, [locations, locationsKey, videoId]);

  const handleToggleActive = useCallback(
    (p: GeocodedPlace) => {
      setActiveLocation((prev) => {
        const next = prev?._idx === p._idx ? null : p;
        // Open the Leaflet popup for the new active place
        if (next) {
          setTimeout(() => {
            const marker = markerRefs.current.get(next._idx);
            if (marker) marker.openPopup();
          }, 400); // after flyTo animation starts
        }
        return next;
      });
    },
    [],
  );

  const handleSave = useCallback(
    (p: GeocodedPlace) => {
      toggleSavedPlace(p);
    },
    [toggleSavedPlace],
  );

  const pending = places.some(
    (p) => p.geocodeStatus === 'idle' || p.geocodeStatus === 'loading',
  );

  const initialCenter: [number, number] = [20, 0];
  const initialZoom = 2;

  return (
    <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="bg-linear-to-r from-blue-50/50 to-white p-5 border-b border-gray-50 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100/50 flex items-center justify-center text-blue-600">
          <MapPin size={18} aria-hidden="true" />
        </div>
        <h3 className="font-bold text-gray-900 uppercase tracking-wider text-sm">
          {places.length} PLACES
        </h3>
        {pending && (
          <span className="ml-auto text-xs text-gray-400 animate-pulse">locating…</span>
        )}
      </div>

      {/* Map */}
      <div className="h-64 w-full relative z-0">
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution="© Google Maps"
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          />

          <BoundsFitter
            places={places}
            active={activeLocation}
            locationsKey={locationsKey}
          />
          <MapController activeLoc={activeLocation} />

          {places
            .filter((p) => p.coords !== null)
            .map((p) => {
              const isSaved = savedPlaces.some(
                (s: LocationPlace) => (s.id ?? s.name) === (p.id ?? p.name),
              );
              return (
                <Marker
                  key={p._idx}
                  position={p.coords!}
                  icon={createCustomIcon(
                    p.rank ?? p._idx + 1,
                    activeLocation?._idx === p._idx,
                  )}
                  ref={(ref) => {
                    if (ref) markerRefs.current.set(p._idx, ref);
                    else markerRefs.current.delete(p._idx);
                  }}
                  eventHandlers={{
                    click: () => handleToggleActive(p),
                  }}
                >
                  <Popup
                    closeButton={false}
                    className="recolekt-popup"
                    offset={[0, -(createCustomIcon(p.rank ?? p._idx + 1).options.iconSize as [number, number])[1] / 2 - 4]}
                  >
                    <PopupContent
                      place={p}
                      isSaved={isSaved}
                      onSave={(e) => {
                        e.stopPropagation();
                        handleSave(p);
                      }}
                    />
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>
      </div>

      {/* Place list */}
      <div className="p-4 space-y-2">
        {places.map((p) => {
          const locId = p.id ?? p.name;
          const isSaved = savedPlaces.some(
            (s: LocationPlace) => (s.id ?? s.name) === locId,
          );
          const isActive = activeLocation?._idx === p._idx;
          const locationLine = buildLocationLine(p);

          return (
            <div
              key={p._idx}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
                isActive
                  ? 'border-blue-200 bg-blue-50/40'
                  : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/50'
              }`}
              onClick={() => handleToggleActive(p)}
            >
              {/* Number badge */}
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm transition-colors ${
                  isActive ? 'bg-blue-700' : 'bg-blue-600'
                }`}
              >
                {p.rank ?? p._idx + 1}
              </div>

              {/* Name + subtitle block */}
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 text-sm truncate leading-tight">
                  {p.name}
                </h4>

                {/* Primary subtitle: description from LLM */}
                {p.description ? (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{p.description}</p>
                ) : p.type ? (
                  <p className="text-xs text-gray-400 truncate mt-0.5 italic">{p.type}</p>
                ) : null}

                {/* Secondary: location line — city, region, country */}
                {locationLine && (
                  <p className="text-xs text-blue-500 font-medium truncate">
                    {locationLine}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave(p);
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    isSaved
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                  aria-label={isSaved ? 'Remove bookmark' : 'Save place'}
                >
                  {isSaved ? (
                    <BookmarkCheck size={17} aria-hidden="true" />
                  ) : (
                    <Bookmark size={17} aria-hidden="true" />
                  )}
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const dest = p.coords
                      ? `${p.coords[0]},${p.coords[1]}`
                      : encodeURIComponent(`${p.name} ${p.city ?? ''}`);
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
                      '_blank',
                      'noopener,noreferrer',
                    );
                  }}
                  className="px-3 h-9 rounded-xl bg-blue-50 text-blue-600 font-semibold text-xs flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
                  aria-label={`Directions to ${p.name}`}
                >
                  <Navigation size={13} aria-hidden="true" />
                  <span className="hidden sm:inline">Directions</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LocationCard;