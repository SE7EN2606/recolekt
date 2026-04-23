/**
 * LocationCard.tsx
 *
 * Changes:
 * - marker click / row click opens a compact bottom card instead of Leaflet popup
 * - unresolved places open Google Maps search instead of doing nothing
 * - list shows COUNTRY only on the right
 * - map card is smaller and bottom-docked
 * - no oversized cropped popup
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Bookmark, BookmarkCheck, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { API_BASE } from '../utils/api';

/* ── Local types ─────────────────────────────────────────────────────────── */

export interface LocationPlace {
  id?: string;
  name: string;
  type?: string;
  place_type?: string;
  city?: string;
  region?: string;
  country?: string;
  address?: string;
  neighborhood?: string;
  postal_code?: string;
  description?: string;
  instagram?: string;
  instagram_username?: string;
  instagram_account_name?: string;
  google_place_id?: string;
  maps_url?: string;
  photo_url?: string;
  emoji?: string;
  rank?: number;
  lat?: number | null;
  lng?: number | null;
  _vid?: string;
  _idx?: number;
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

/* ── Guard against duplicate PATCHes ─────────────────────────────────────── */

const patchesInFlight = new Set<string>();

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function getToken(): string {
  try {
    return (window as any).__REKOLEKT_TOKEN__ ?? localStorage.getItem('auth_token') ?? '';
  } catch {
    return '';
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toCoords(lat: unknown, lng: unknown): [number, number] | null {
  const latNum = toNumberOrNull(lat);
  const lngNum = toNumberOrNull(lng);
  return latNum != null && lngNum != null ? [latNum, lngNum] : null;
}

function getSavedPlaceKey(place: Partial<LocationPlace>, fallbackVideoId?: string): string {
  const vid = String(place._vid || fallbackVideoId || '').trim();
  const idx = typeof place._idx === 'number' ? place._idx : Number(place._idx);

  if (vid && Number.isFinite(idx)) {
    return `${vid}:${idx}`;
  }

  return [
    String(place.id || '').trim().toLowerCase(),
    String(place.name || '').trim().toLowerCase(),
    String(place.city || '').trim().toLowerCase(),
    String(place.country || '').trim().toLowerCase(),
  ].join('|');
}

function isPlaceSaved(
  savedPlaces: LocationPlace[],
  place: Partial<LocationPlace>,
  fallbackVideoId?: string,
): boolean {
  const targetKey = getSavedPlaceKey(place, fallbackVideoId);
  return savedPlaces.some((saved) => getSavedPlaceKey(saved) === targetKey);
}

function buildCountryLabel(place: LocationPlace): string {
  return String(place.country || '').trim();
}

function buildMapsUrl(place: Partial<LocationPlace> & { coords?: [number, number] | null }): string {
  if (place.coords) {
    return `https://www.google.com/maps/dir/?api=1&destination=${place.coords[0]},${place.coords[1]}`;
  }

  const query = [place.name, place.city, place.region, place.country]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/* ── Persist coords to backend ───────────────────────────────────────────── */

async function persistLocationCoords(
  videoId: string,
  locations: LocationPlace[],
): Promise<LocationPlace[] | null> {
  const token = getToken();

  const payload = locations.map((p) => ({
    name: p.name,
    type: p.type ?? p.place_type ?? null,
    place_type: p.place_type ?? p.type ?? null,
    city: p.city ?? null,
    region: p.region ?? null,
    country: p.country ?? null,
    address: p.address ?? null,
    neighborhood: p.neighborhood ?? null,
    postal_code: p.postal_code ?? null,
    description: p.description ?? null,
    instagram: p.instagram ?? p.instagram_username ?? null,
    instagram_username: p.instagram_username ?? p.instagram ?? null,
    instagram_account_name: p.instagram_account_name ?? null,
    google_place_id: p.google_place_id ?? null,
    maps_url: p.maps_url ?? null,
    emoji: p.emoji ?? null,
    rank: p.rank ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
  }));

  try {
    const res = await fetch(`${API_BASE}/api/reel/${videoId}/location`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ location: payload }),
    });

    if (!res.ok) return null;

    const data = await res.json();
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
  });
}

/* ── Map helpers ─────────────────────────────────────────────────────────── */

const MapController = ({ activeLoc }: { activeLoc: GeocodedPlace | null }) => {
  const map = useMap();

  useEffect(() => {
    if (activeLoc?.coords) {
      map.flyTo(activeLoc.coords, 14, { duration: 1.05 });
    }
  }, [activeLoc, map]);

  return null;
};

const MapInvalidator = ({ trigger }: { trigger: string }) => {
  const map = useMap();

  useEffect(() => {
    const t1 = window.setTimeout(() => map.invalidateSize(), 0);
    const t2 = window.setTimeout(() => map.invalidateSize(), 250);
    const t3 = window.setTimeout(() => map.invalidateSize(), 700);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [map, trigger]);

  return null;
};

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
    map.invalidateSize();

    if (resolved.length === 1) {
      map.flyTo(resolved[0].coords!, 13, { duration: 1.05 });
      return;
    }

    const bounds = L.latLngBounds(resolved.map((p) => p.coords!));
    map.flyToBounds(bounds, {
      padding: [40, 40],
      maxZoom: 14,
      duration: 1.05,
    });
  }, [active, resolved, resolvedSignature, map]);

  return null;
};

/* ── Bottom map card ─────────────────────────────────────────────────────── */

const ActiveMapCard: React.FC<{
  place: GeocodedPlace;
  isSaved: boolean;
  onSave: () => void;
  onClose: () => void;
}> = ({ place, isSaved, onSave, onClose }) => {
  const country = buildCountryLabel(place);
  const mapsUrl = buildMapsUrl(place);

  return (
    <div className="absolute left-3 right-3 bottom-3 z-[1000] md:left-4 md:right-4">
      <div className="bg-white/97 backdrop-blur rounded-2xl shadow-lg border border-gray-200 p-3">
        <div className="flex items-start gap-3">
          {place.photo_url ? (
            <img
              src={place.photo_url}
              alt={place.name}
              className="w-16 h-16 rounded-xl object-cover shrink-0"
            />
          ) : null}

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-gray-900 text-sm leading-tight truncate">
                    {place.name}
                  </h4>
                  {country && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-semibold">
                      {country}
                    </span>
                  )}
                </div>

                {(place.type || place.place_type) && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {place.type || place.place_type}
                  </p>
                )}
              </div>

              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 flex items-center justify-center shrink-0"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={onSave}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  isSaved
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
                aria-label={isSaved ? 'Remove bookmark' : 'Save place'}
              >
                {isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </button>

              <button
                onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
                className="h-9 px-3 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-700 transition-colors"
              >
                <Navigation size={13} />
                Directions
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Main component ──────────────────────────────────────────────────────── */

export const LocationCard: React.FC<LocationCardProps> = ({ locations, videoId }) => {
  const ctx = useData() as any;
  const savedPlaces: LocationPlace[] = ctx.savedPlaces ?? [];
  const toggleSavedPlace: (place: LocationPlace) => void = ctx.toggleSavedPlace ?? (() => {});

  const [places, setPlaces] = useState<GeocodedPlace[]>([]);
  const [activeLocation, setActiveLocation] = useState<GeocodedPlace | null>(null);

  const activePatchKeyRef = useRef<string | null>(null);

  const locationsKey = useMemo(
    () =>
      locations
        .map(
          (l) =>
            `${l.name}|${l.city ?? ''}|${l.region ?? ''}|${l.country ?? ''}|${l.lat ?? ''}|${l.lng ?? ''}`,
        )
        .join('||'),
    [locations],
  );

  const patchKey = useMemo(() => `${videoId || 'no-video'}::${locationsKey}`, [videoId, locationsKey]);

  useEffect(() => {
    const initial: GeocodedPlace[] = (locations || []).map((loc, i) => {
      const coords = toCoords(loc.lat, loc.lng);
      return {
        ...loc,
        _idx: typeof loc._idx === 'number' ? loc._idx : i,
        coords,
        geocodeStatus: coords ? 'done' : 'idle',
      };
    });

    setPlaces(initial);
    setActiveLocation(null);
    activePatchKeyRef.current = patchKey;

    const hasMissingCoords = initial.some((p) => p.geocodeStatus === 'idle');
    if (!hasMissingCoords || !videoId) return;

    if (patchesInFlight.has(patchKey)) {
      setPlaces((prev) =>
        prev.map((p) =>
          p.geocodeStatus === 'idle' ? { ...p, geocodeStatus: 'loading' as const } : p,
        ),
      );
      return;
    }

    patchesInFlight.add(patchKey);

    setPlaces((prev) =>
      prev.map((p) =>
        p.geocodeStatus === 'idle' ? { ...p, geocodeStatus: 'loading' as const } : p,
      ),
    );

    (async () => {
      try {
        const enriched = await persistLocationCoords(videoId, locations);

        if (!enriched) {
          if (activePatchKeyRef.current !== patchKey) return;
          setPlaces((prev) =>
            prev.map((p) =>
              p.geocodeStatus === 'loading' || p.geocodeStatus === 'idle'
                ? { ...p, geocodeStatus: 'failed' as const }
                : p,
            ),
          );
          return;
        }

        if (activePatchKeyRef.current !== patchKey) return;

        const resolved: GeocodedPlace[] = enriched.map((loc, i) => {
          const previous = initial[i];
          const coords = toCoords(loc?.lat, loc?.lng);

          return {
            ...(previous || {
              name: loc?.name || '',
              _idx: i,
              coords: null,
              geocodeStatus: 'idle' as const,
            }),
            ...(loc || {}),
            _idx: previous?._idx ?? i,
            coords,
            geocodeStatus: coords ? 'done' : 'failed',
          };
        });

        setPlaces(resolved);
      } finally {
        patchesInFlight.delete(patchKey);
      }
    })();
  }, [locations, locationsKey, videoId, patchKey]);

  useEffect(() => {
    if (!activeLocation) return;
    const fresh = places.find((p) => p._idx === activeLocation._idx);
    if (!fresh) return;
    if (
      fresh !== activeLocation &&
      (
        fresh.name !== activeLocation.name ||
        fresh.country !== activeLocation.country ||
        fresh.lat !== activeLocation.lat ||
        fresh.lng !== activeLocation.lng
      )
    ) {
      setActiveLocation(fresh);
    }
  }, [places, activeLocation]);

  const handleActivatePlace = useCallback((p: GeocodedPlace) => {
    if (!p.coords) {
      window.open(buildMapsUrl(p), '_blank', 'noopener,noreferrer');
      return;
    }

    setActiveLocation((prev) => (prev?._idx === p._idx ? null : p));
  }, []);

  const handleSave = useCallback(
    (p: GeocodedPlace) => {
      toggleSavedPlace({
        ...p,
        _vid: videoId,
        _idx: p._idx,
        lat: p.coords?.[0] ?? p.lat ?? null,
        lng: p.coords?.[1] ?? p.lng ?? null,
        type: p.type ?? p.place_type,
        place_type: p.place_type ?? p.type,
        instagram: p.instagram ?? p.instagram_username,
        instagram_username: p.instagram_username ?? p.instagram,
      });
    },
    [toggleSavedPlace, videoId],
  );

  const pending = places.some((p) => p.geocodeStatus === 'idle' || p.geocodeStatus === 'loading');

  const initialCenter: [number, number] = [20, 0];
  const initialZoom = 2;

  const activeSaved = activeLocation
    ? isPlaceSaved(savedPlaces, { ...activeLocation, _vid: videoId }, videoId)
    : false;

  return (
    <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden mb-6">
      <div className="bg-linear-to-r from-blue-50/50 to-white p-5 border-b border-gray-50 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100/50 flex items-center justify-center text-blue-600">
          <MapPin size={18} aria-hidden="true" />
        </div>
        <h3 className="font-bold text-gray-900 uppercase tracking-wider text-sm">
          {places.length} PLACES
        </h3>
        {pending && <span className="ml-auto text-xs text-gray-400 animate-pulse">locating…</span>}
      </div>

      <div className="h-72 md:h-80 w-full relative z-0">
        <MapContainer center={initialCenter} zoom={initialZoom} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution="© Google Maps" url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />

          <MapInvalidator trigger={`${locationsKey}::${places.map((p) => `${p._idx}:${p.lat ?? ''},${p.lng ?? ''}`).join('|')}`} />
          <BoundsFitter places={places} active={activeLocation} locationsKey={locationsKey} />
          <MapController activeLoc={activeLocation} />

          {places
            .filter((p) => p.coords !== null)
            .map((p) => (
              <Marker
                key={`${p._idx}-${p.coords![0]}-${p.coords![1]}`}
                position={p.coords!}
                icon={createCustomIcon(p.rank ?? p._idx + 1, activeLocation?._idx === p._idx)}
                eventHandlers={{
                  click: () => handleActivatePlace(p),
                }}
              />
            ))}
        </MapContainer>

        {activeLocation && activeLocation.coords && (
          <ActiveMapCard
            place={activeLocation}
            isSaved={activeSaved}
            onSave={() => handleSave(activeLocation)}
            onClose={() => setActiveLocation(null)}
          />
        )}
      </div>

      <div className="p-4 space-y-2">
        {places.map((p) => {
          const isSaved = isPlaceSaved(savedPlaces, { ...p, _vid: videoId }, videoId);
          const isActive = activeLocation?._idx === p._idx;
          const country = buildCountryLabel(p);

          return (
            <div
              key={p._idx}
              className={`flex items-start gap-3 px-4 py-3 rounded-2xl transition-all cursor-pointer ${
                isActive
                  ? 'border-2 border-blue-500 bg-blue-50/40 shadow-sm'
                  : 'border border-gray-100 bg-white hover:border-blue-300 hover:bg-blue-50/30'
              }`}
              onClick={() => handleActivatePlace(p)}
            >
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm transition-colors ${
                  isActive ? 'bg-blue-700' : 'bg-blue-600'
                }`}
              >
                {p.rank ?? p._idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 text-sm leading-tight">
                  {p.name}
                </h4>

                {p.description ? (
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {p.description}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                {country ? (
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-semibold text-[11px] leading-none">
                    {country}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-400 font-semibold text-[11px] leading-none">
                    No pin
                  </span>
                )}

                <div className="flex items-center gap-1.5">
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
                      window.open(buildMapsUrl(p), '_blank', 'noopener,noreferrer');
                    }}
                    className="px-3 h-9 rounded-xl bg-blue-50 text-blue-600 font-semibold text-xs flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
                    aria-label={`Directions to ${p.name}`}
                  >
                    <Navigation size={13} aria-hidden="true" />
                    <span className="hidden sm:inline">Directions</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LocationCard;