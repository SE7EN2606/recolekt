/**
 * LocationCard.tsx
 *
 * Uses react-leaflet + Google Maps tile layer.
 * - flyTo via useMap on place click (MapController)
 * - BoundsFitter: auto-fits map to all resolved markers after geocoding
 * - Blue #2563eb numbered circle markers
 * - Geocodes missing lat/lng via /api/geocode proxy
 * - PATCHes resolved coords to Neon DB once — next load skips Nominatim
 * - "locating…" badge only visible while actively geocoding
 *
 * FIXES:
 *  - refits whenever the resolved marker set changes, so the map centers on
 *    all places instead of getting stuck on an early partial result
 *  - resets fit state correctly when the locations list changes
 *  - keeps flyTo behavior when a user selects a place
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Bookmark, BookmarkCheck } from 'lucide-react';
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

async function persistLocationCoords(videoId: string, places: GeocodedPlace[]): Promise<void> {
  const token = getToken();

  const payload = places.map((p) => ({
    name: p.name,
    type: p.type,
    city: p.city,
    region: p.region,
    country: p.country,
    address: p.address ?? null,
    neighborhood: p.neighborhood ?? null,
    description: p.description,
    emoji: p.emoji,
    rank: p.rank,
    lat: p.coords ? p.coords[0] : null,
    lng: p.coords ? p.coords[1] : null,
  }));

  try {
    await fetch(`${API_BASE}/api/reel/${videoId}/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ location: payload }),
    });
  } catch {}
}

/* ── Leaflet numbered icon ───────────────────────────────────────────────── */

function createCustomIcon(number: number): L.DivIcon {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="width:24px;height:24px;background-color:#2563eb;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);">${number}</div>`,
    iconSize: [24, 24] as [number, number],
    iconAnchor: [12, 12] as [number, number],
  });
}

/* ── MapController: flyTo on place click ────────────────────────────────── */

const MapController = ({ activeLoc }: { activeLoc: GeocodedPlace | null }) => {
  const map = useMap();

  useEffect(() => {
    if (activeLoc?.coords) {
      map.flyTo(activeLoc.coords, 15, { duration: 1.5 });
    }
  }, [activeLoc, map]);

  return null;
};

/* ── BoundsFitter: auto-center after geocoding ───────────────────────────── */

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

  const resolved = useMemo(
    () => places.filter((p) => p.coords !== null),
    [places],
  );

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

/* ── Component ───────────────────────────────────────────────────────────── */

export const LocationCard: React.FC<LocationCardProps> = ({ locations, videoId }) => {
  const ctx = useData() as any;
  const savedPlaces: LocationPlace[] = ctx.savedPlaces ?? [];
  const toggleSavedPlace: (place: LocationPlace) => void = ctx.toggleSavedPlace ?? (() => {});

  const [places, setPlaces] = useState<GeocodedPlace[]>([]);
  const [activeLocation, setActiveLocation] = useState<GeocodedPlace | null>(null);

  const persistedRef = useRef(false);
  const geocodingKeyRef = useRef<string | null>(null);

  const locationsKey = useMemo(
    () => locations.map((l) => `${l.name}|${l.city ?? ''}|${l.region ?? ''}|${l.country ?? ''}`).join('||'),
    [locations],
  );

  useEffect(() => {
    if (!locations?.length) return;

    if (geocodingKeyRef.current === locationsKey) return;
    geocodingKeyRef.current = locationsKey;

    persistedRef.current = false;
    setActiveLocation(null);

    const initial: GeocodedPlace[] = locations.map((loc, i) => ({
      ...loc,
      _idx: i,
      coords:
        loc.lat != null && loc.lng != null
          ? [Number(loc.lat), Number(loc.lng)] as [number, number]
          : null,
      geocodeStatus: loc.lat != null && loc.lng != null ? 'done' : 'idle',
    }));

    setPlaces(initial);

    if (!initial.some((p) => p.geocodeStatus === 'idle')) return;

    let cancelled = false;
    const working = [...initial];

    (async () => {
      for (let i = 0; i < working.length; i++) {
        if (cancelled) break;
        if (working[i].geocodeStatus !== 'idle') continue;

        working[i] = { ...working[i], geocodeStatus: 'loading' };
        setPlaces([...working]);

        const loc = locations[i];
        const coords = await geocodeViaProxy(
          loc.name,
          loc.region ?? loc.city,
          loc.country,
        );

        if (cancelled) break;

        working[i] = {
          ...working[i],
          coords,
          geocodeStatus: coords ? 'done' : 'failed',
        };

        setPlaces([...working]);
      }

      if (!cancelled && videoId && !persistedRef.current) {
        const anyNew = working.some(
          (p, i) => p.coords && (locations[i]?.lat == null || locations[i]?.lng == null),
        );

        if (anyNew) {
          persistedRef.current = true;
          await persistLocationCoords(videoId, working);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locations, locationsKey, videoId]);

  const pending = places.some(
    (p) => p.geocodeStatus === 'idle' || p.geocodeStatus === 'loading',
  );

  const initialCenter: [number, number] = [20, 0];
  const initialZoom = 2;

  return (
    <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden mb-6">
      <div className="bg-linear-to-r from-blue-50/50 to-white p-5 border-b border-gray-50 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100/50 flex items-center justify-center text-blue-600">
          <MapPin size={18} aria-hidden="true" />
        </div>
        <h3 className="font-bold text-gray-900 uppercase tracking-wider text-sm">
          {places.length} PLACES
        </h3>
        {pending && (
          <span className="ml-auto text-xs text-gray-400">locating…</span>
        )}
      </div>

      <div className="h-100 w-full relative z-0">
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution="© Google Maps"
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          />

          <BoundsFitter places={places} active={activeLocation} locationsKey={locationsKey} />
          <MapController activeLoc={activeLocation} />

          {places
            .filter((p) => p.coords !== null)
            .map((p) => (
              <Marker
                key={p._idx}
                position={p.coords!}
                icon={createCustomIcon(p.rank ?? p._idx + 1)}
                eventHandlers={{
                  click: () => setActiveLocation((prev) => (prev?._idx === p._idx ? null : p)),
                }}
              />
            ))}
        </MapContainer>
      </div>

      <div className="p-4 space-y-3">
        {places.map((p) => {
          const locId = p.id ?? p.name;
          const isSaved = savedPlaces.some(
            (s: LocationPlace) => (s.id ?? s.name) === locId,
          );
          const isActive = activeLocation?._idx === p._idx;

          return (
            <div
              key={p._idx}
              className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                isActive
                  ? 'border-blue-200 bg-blue-50/30'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
              onClick={() => setActiveLocation((prev) => (prev?._idx === p._idx ? null : p))}
            >
              <div className="shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {p.rank ?? p._idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 truncate">{p.name}</h4>
                {p.type && (
                  <p className="text-xs text-gray-500 truncate">{p.type}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSavedPlace(p);
                  }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    isSaved
                      ? 'bg-primary-50 text-primary-600'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                  aria-label={isSaved ? 'Remove bookmark' : 'Save place'}
                >
                  {isSaved
                    ? <BookmarkCheck size={20} aria-hidden="true" />
                    : <Bookmark size={20} aria-hidden="true" />}
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
                  className="px-4 h-10 rounded-xl bg-blue-50 text-blue-600 font-bold text-sm flex items-center gap-2 hover:bg-blue-100 transition-colors"
                  aria-label={`Directions to ${p.name}`}
                >
                  <Navigation size={16} aria-hidden="true" />
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