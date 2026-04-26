import type React from 'react';
import L from 'leaflet';

export interface LocationPlace {
  rank?: number | string | null;
  name?: string | null;
  google_name?: string | null;
  type?: string | null;
  place_type?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  postal_code?: string | null;
  description?: string | null;
  emoji?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  maps_url?: string | null;
  google_place_id?: string | null;
  photo_url?: string | null;
  rating?: number | string | null;
  google_rating?: number | string | null;
  user_ratings_total?: number | string | null;
  review_count?: number | string | null;
  price_level?: number | string | null;
  instagram_username?: string | null;
  instagram_account_name?: string | null;
  is_saved?: boolean | null;
  isSaved?: boolean | null;
  saved?: boolean | null;
  is_bookmarked?: boolean | null;
}

export interface LocationData {
  places?: LocationPlace[] | null;
  items?: LocationPlace[] | null;
  location?: LocationPlace[] | LocationPlace | null;
  country?: string | null;
  title?: string | null;
}

export type LocationInput =
  | LocationData
  | LocationPlace[]
  | LocationPlace
  | null
  | undefined;

export interface GeocodedPlace extends LocationPlace {
  _idx: number;
  rank: number;
  name: string;
  coords: { lat: number; lng: number } | null;
  status: 'idle' | 'loading' | 'done' | 'failed';
}

export const BLUE = '#2563ff';
export const BLUE_DARK = '#174ee8';
export const BLUE_SOFT = '#eef5ff';
export const BLUE_BORDER = '#bfdbfe';
export const TEXT = '#111827';
export const MUTED = '#6b7280';

function envValue(...keys: string[]): string {
  for (const key of keys) {
    const value = ((import.meta as any).env?.[key] as string | undefined)?.trim();
    if (value) return value;
  }

  return '';
}

const RAW_API_BASE =
  envValue('VITE_API_BASE', 'VITE_API_URL', 'VITE_BACKEND_URL') ||
  ((import.meta as any).env?.DEV ? 'http://localhost:5001' : '');

const API_BASE = RAW_API_BASE.replace(/\/$/, '');

const MAPS_KEY = envValue(
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_KEY',
  'VITE_GOOGLE_API_KEY',
);

export const hydrationInFlight = new Map<string, Promise<GeocodedPlace[] | null>>();
export const hydrationDone = new Set<string>();
export const hydrationCache = new Map<string, GeocodedPlace[]>();

const googleDetailsCache = new Map<string, Promise<Partial<LocationPlace> | null>>();
let googleMapsLoadPromise: Promise<boolean> | null = null;

function apiPath(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return API_BASE.endsWith('/api')
    ? `${API_BASE}${cleanPath}`
    : `${API_BASE}/api${cleanPath}`;
}

export function getToken(): string {
  try {
    const direct =
      (window as any).__REKOLEKT_TOKEN__ ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('jwt') ||
      localStorage.getItem('recolekt_token') ||
      '';

    if (direct) {
      return String(direct).replace(/^Bearer\s+/i, '').trim();
    }

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;

      const value = localStorage.getItem(key);
      if (!value) continue;

      const lowerKey = key.toLowerCase();
      const looksRelevant =
        lowerKey.includes('token') ||
        lowerKey.includes('jwt') ||
        lowerKey.includes('auth');

      const looksLikeJwt = value.split('.').length === 3;

      if (looksRelevant && looksLikeJwt) {
        return value.replace(/^Bearer\s+/i, '').trim();
      }
    }

    return '';
  } catch {
    return '';
  }
}

export function authHeaders(): Record<string, string> {
  const token = getToken();

  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function placeKey(place: Pick<GeocodedPlace, 'name' | '_idx'>): string {
  return `${place._idx}:${place.name.trim().toLowerCase()}`;
}

export function isInvalidPlaceName(name?: string | null): boolean {
  const n = String(name || '').trim().toLowerCase();

  return (
    !n ||
    n === 'unknown' ||
    n === 'unnamed' ||
    n === 'n/a' ||
    n === 'na' ||
    n === 'not specified' ||
    n === 'none' ||
    n === 'null' ||
    n === 'tbd' ||
    n.startsWith('unnamed ') ||
    n.startsWith('unknown ') ||
    n.startsWith('not specified ') ||
    /^first (hotel|resort|aparthotel|place|option)$/.test(n) ||
    /^second (hotel|resort|aparthotel|place|option)$/.test(n)
  );
}

export function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function coordsFromPlace(place: LocationPlace): { lat: number; lng: number } | null {
  const lat = numberOrNull(place.lat);
  const lng = numberOrNull(place.lng);

  if (
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat, lng };
}

export function rankFromPlace(place: LocationPlace, idx: number): number {
  const rank = Number(place.rank);
  return Number.isFinite(rank) && rank > 0 ? rank : idx + 1;
}

export function normalizePlace(
  place: LocationPlace,
  idx: number,
  fallbackCountry?: string | null,
): GeocodedPlace | null {
  const name = String(place.name || '').trim();

  if (isInvalidPlaceName(name)) {
    return null;
  }

  const coords = coordsFromPlace(place);

  return {
    ...place,
    name,
    rank: rankFromPlace(place, idx),
    type: place.type || place.place_type || null,
    country: place.country || fallbackCountry || null,
    _idx: typeof (place as any)._idx === 'number' ? (place as any)._idx : idx,
    coords,
    status: coords ? 'done' : 'idle',
  };
}

export function extractPlaces(input: LocationInput): LocationPlace[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.filter((p): p is LocationPlace => !!p && typeof p === 'object');
  }

  if (typeof input !== 'object') {
    return [];
  }

  const data = input as LocationData & LocationPlace;

  if (Array.isArray(data.places)) {
    return data.places;
  }

  if (Array.isArray(data.items)) {
    return data.items;
  }

  if (Array.isArray(data.location)) {
    return data.location;
  }

  if (data.location && typeof data.location === 'object') {
    return [data.location];
  }

  if ('name' in data) {
    return [data as LocationPlace];
  }

  return [];
}

export function fallbackCountryFromInput(input: LocationInput): string | null {
  if (!input || Array.isArray(input) || typeof input !== 'object') {
    return null;
  }

  return (input as LocationData).country || null;
}

export function mapPlaceForBackend(place: GeocodedPlace) {
  return {
    name: place.name,
    google_name: place.google_name || null,
    type: place.type || place.place_type || null,
    city: place.city || null,
    region: place.region || null,
    country: place.country || null,
    address: place.address || null,
    neighborhood: place.neighborhood || null,
    postal_code: place.postal_code || null,
    description: place.description || null,
    lat: place.coords?.lat ?? place.lat ?? null,
    lng: place.coords?.lng ?? place.lng ?? null,
    maps_url: place.maps_url || null,
    google_place_id: place.google_place_id || null,
    photo_url: place.photo_url || null,
    rating: place.rating || place.google_rating || null,
    google_rating: place.google_rating || place.rating || null,
    user_ratings_total: place.user_ratings_total || place.review_count || null,
    review_count: place.review_count || place.user_ratings_total || null,
    instagram_username: place.instagram_username || null,
    instagram_account_name: place.instagram_account_name || null,
    is_saved: place.is_saved || place.isSaved || place.saved || place.is_bookmarked || false,
  };
}

export async function patchBackendLocations(
  processId: string,
  places: GeocodedPlace[],
): Promise<GeocodedPlace[] | null> {
  if (!API_BASE) {
    console.error('Missing API base URL. Set VITE_API_BASE, VITE_API_URL, or VITE_BACKEND_URL.');
    return null;
  }

  const payload = places.map(mapPlaceForBackend);

  const res = await fetch(apiPath(`/reel/${encodeURIComponent(processId)}/location`), {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ location: payload }),
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  const responseLocation = data?.location;

  const nextRaw = extractPlaces(responseLocation);

  return nextRaw
    .map((p, i) => normalizePlace(p, i))
    .filter((p): p is GeocodedPlace => !!p);
}

export async function persistSavedPlace(
  shouldSave: boolean,
  processId: string | undefined,
  place: GeocodedPlace,
): Promise<void> {
  if (!processId || !API_BASE) return;

  const mappedPlace = mapPlaceForBackend({
    ...place,
    is_saved: shouldSave,
    isSaved: shouldSave,
    saved: shouldSave,
    is_bookmarked: shouldSave,
  });

  const body = {
    video_id: processId,
    process_id: processId,
    reel_id: processId,
    place: mappedPlace,
    location: mappedPlace,
    should_save: shouldSave,
    saved: shouldSave,
    is_saved: shouldSave,
    ...mappedPlace,
  };

  const encodedVideoId = encodeURIComponent(processId);
  const encodedName = encodeURIComponent(place.name);

  const attempts = shouldSave
    ? [
        { url: apiPath('/saved_places'), method: 'POST' },
        { url: apiPath('/saved_places/'), method: 'POST' },
        { url: apiPath('/saved-places'), method: 'POST' },
        { url: apiPath('/saved_places/save'), method: 'POST' },
        { url: apiPath('/saved_places/toggle'), method: 'POST' },
        { url: apiPath(`/reel/${encodedVideoId}/saved_places`), method: 'POST' },
      ]
    : [
        { url: apiPath(`/saved_places?video_id=${encodedVideoId}&name=${encodedName}`), method: 'DELETE' },
        { url: apiPath(`/saved_places?process_id=${encodedVideoId}&name=${encodedName}`), method: 'DELETE' },
        { url: apiPath(`/saved-places?video_id=${encodedVideoId}&name=${encodedName}`), method: 'DELETE' },
        { url: apiPath('/saved_places/delete'), method: 'POST' },
        { url: apiPath('/saved_places/toggle'), method: 'POST' },
        { url: apiPath(`/reel/${encodedVideoId}/saved_places/${encodedName}`), method: 'DELETE' },
      ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (res.ok || res.status === 204 || res.status === 409) {
        return;
      }
    } catch {
      // Try next endpoint shape.
    }
  }

  throw new Error('Could not persist saved place');
}

export function makeNumberedIcon(num: number, active: boolean): L.DivIcon {
  const size = active ? 42 : 38;
  const inner = active ? 34 : 31;

  return L.divIcon({
    className: 'recolekt-location-marker',
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:999px;
        background:transparent;
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        <div style="
          width:${inner}px;
          height:${inner}px;
          border-radius:999px;
          background:${active ? BLUE_DARK : BLUE};
          color:#fff;
          border:3px solid #fff;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:15px;
          line-height:1;
          font-weight:850;
          font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
          box-shadow:0 3px 8px rgba(15,23,42,0.22);
        ">
          ${num}
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function displayName(place: GeocodedPlace): string {
  return String(place.google_name || place.name || '').trim();
}

export function ratingValue(place: GeocodedPlace): number | null {
  return numberOrNull(place.rating ?? place.google_rating);
}

export function reviewCount(place: GeocodedPlace): number | null {
  return numberOrNull(place.user_ratings_total ?? place.review_count);
}

export function ratingMeta(place: GeocodedPlace): string {
  const rating = ratingValue(place);
  const reviews = reviewCount(place);
  const type = place.type || place.place_type || '';

  const parts: string[] = [];

  if (rating !== null) {
    parts.push(`${rating.toFixed(1)} ★`);
  }

  if (reviews !== null) {
    parts.push(`(${reviews})`);
  }

  if (type) {
    parts.push(type);
  }

  return parts.join(' · ');
}

function googlePlaceQuery(place: GeocodedPlace): string {
  return [
    place.google_name || place.name,
    place.city,
    place.region,
    place.country,
  ]
    .filter(Boolean)
    .join(', ');
}

function googleTypesToType(types?: string[] | null): string | null {
  if (!types?.length) return null;

  if (types.includes('resort_hotel')) return 'Resort';
  if (types.includes('lodging')) return 'Hotel';
  if (types.includes('restaurant')) return 'Restaurant';
  if (types.includes('cafe')) return 'Café';
  if (types.includes('bar')) return 'Bar';
  if (types.includes('tourist_attraction')) return 'Attraction';

  return null;
}

function photoUrlFromPlace(place: any): string | null {
  try {
    const photo = place?.photos?.[0];
    if (!photo?.getUrl) return null;

    return photo.getUrl({
      maxWidth: 420,
      maxHeight: 260,
    });
  } catch {
    return null;
  }
}

async function ensureGooglePlaces(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const w = window as any;

  if (w.google?.maps?.places && w.google?.maps?.Geocoder) {
    return true;
  }

  if (googleMapsLoadPromise) {
    return googleMapsLoadPromise;
  }

  const loadPromise = new Promise<boolean>((resolve) => {
    const finish = async () => {
      try {
        if (w.google?.maps?.importLibrary) {
          await Promise.allSettled([
            w.google.maps.importLibrary('places'),
            w.google.maps.importLibrary('geocoding'),
          ]);
        }
      } catch {
        // Continue to final availability check.
      }

      resolve(!!w.google?.maps && (!!w.google.maps.places || !!w.google.maps.Geocoder));
    };

    if (w.google?.maps) {
      finish();
      return;
    }

    if (!MAPS_KEY) {
      console.warn(
        'Location map hydration skipped: missing VITE_GOOGLE_MAPS_API_KEY in frontend build.',
      );
      resolve(false);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );

    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      window.setTimeout(finish, 1800);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      MAPS_KEY,
    )}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = finish;
    script.onerror = () => {
      console.warn('Location map hydration skipped: Google Maps script failed to load.');
      resolve(false);
    };

    document.head.appendChild(script);
  });

  googleMapsLoadPromise = loadPromise;
  return loadPromise;
}

async function fetchGoogleDetailsForPlace(
  place: GeocodedPlace,
): Promise<Partial<LocationPlace> | null> {
  const ready = await ensureGooglePlaces();
  if (!ready) return null;

  const w = window as any;
  const google = w.google;

  const query = googlePlaceQuery(place);
  if (!query) return null;

  const cacheKey = [
    query.toLowerCase(),
    place.coords?.lat ?? '',
    place.coords?.lng ?? '',
  ].join('|');

  const cached = googleDetailsCache.get(cacheKey);
  if (cached) return cached;

  const promise = new Promise<Partial<LocationPlace> | null>((resolve) => {
    const resolveFromPlaceLike = (source: any, fallback: any = null) => {
      const lat =
        source?.geometry?.location?.lat?.() ??
        fallback?.geometry?.location?.lat?.() ??
        null;

      const lng =
        source?.geometry?.location?.lng?.() ??
        fallback?.geometry?.location?.lng?.() ??
        null;

      resolve({
        google_name: source?.name || fallback?.name || null,
        google_place_id: source?.place_id || fallback?.place_id || null,
        maps_url:
          source?.url ||
          (source?.place_id
            ? `https://www.google.com/maps/place/?q=place_id:${source.place_id}`
            : null),
        photo_url: photoUrlFromPlace(source) || photoUrlFromPlace(fallback),
        rating: source?.rating ?? fallback?.rating ?? null,
        google_rating: source?.rating ?? fallback?.rating ?? null,
        user_ratings_total:
          source?.user_ratings_total ?? fallback?.user_ratings_total ?? null,
        review_count:
          source?.user_ratings_total ?? fallback?.user_ratings_total ?? null,
        type: place.type || googleTypesToType(source?.types || fallback?.types) || null,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      });
    };

    const fallbackToGeocoder = () => {
      if (!google.maps.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new google.maps.Geocoder();
      const geocoderOk = google.maps.GeocoderStatus?.OK || 'OK';

      geocoder.geocode({ address: query }, (results: any[], status: any) => {
        if (
          status !== geocoderOk ||
          !Array.isArray(results) ||
          !results.length
        ) {
          resolve(null);
          return;
        }

        const best = results[0];
        const lat = best?.geometry?.location?.lat?.();
        const lng = best?.geometry?.location?.lng?.();

        resolve({
          google_name: best?.formatted_address || place.google_name || place.name,
          google_place_id: best?.place_id || null,
          maps_url: best?.place_id
            ? `https://www.google.com/maps/place/?q=place_id:${best.place_id}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          type: place.type || place.place_type || null,
        });
      });
    };

    if (!google.maps.places?.PlacesService) {
      fallbackToGeocoder();
      return;
    }

    const div = document.createElement('div');
    const service = new google.maps.places.PlacesService(div);

    const request: any = { query };

    if (place.coords) {
      request.location = new google.maps.LatLng(place.coords.lat, place.coords.lng);
      request.radius = 20000;
    }

    service.textSearch(request, (results: any[], status: any) => {
      if (
        status !== google.maps.places.PlacesServiceStatus.OK ||
        !Array.isArray(results) ||
        !results.length
      ) {
        fallbackToGeocoder();
        return;
      }

      const best = results[0];

      if (!best?.place_id) {
        resolveFromPlaceLike(best);
        return;
      }

      service.getDetails(
        {
          placeId: best.place_id,
          fields: [
            'name',
            'rating',
            'user_ratings_total',
            'photos',
            'types',
            'url',
            'place_id',
            'geometry',
          ],
        },
        (details: any, detailStatus: any) => {
          if (
            detailStatus === google.maps.places.PlacesServiceStatus.OK &&
            details
          ) {
            resolveFromPlaceLike(details, best);
            return;
          }

          resolveFromPlaceLike(best);
        },
      );
    });
  });

  googleDetailsCache.set(cacheKey, promise);
  return promise;
}

export async function enrichPlacesWithGoogleDetails(
  places: GeocodedPlace[],
): Promise<GeocodedPlace[]> {
  const enriched = await Promise.all(
    places.map(async (place) => {
      const needsGoogle =
        !place.coords ||
        !place.photo_url ||
        !place.google_name ||
        ratingValue(place) === null ||
        reviewCount(place) === null;

      if (!needsGoogle) return place;

      try {
        const details = await fetchGoogleDetailsForPlace(place);

        if (!details) return place;

        const lat = numberOrNull(details.lat);
        const lng = numberOrNull(details.lng);

        const coords =
          lat !== null &&
          lng !== null &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180
            ? { lat, lng }
            : place.coords;

        return {
          ...place,
          google_name: place.google_name || details.google_name || null,
          google_place_id: place.google_place_id || details.google_place_id || null,
          maps_url: place.maps_url || details.maps_url || null,
          photo_url: place.photo_url || details.photo_url || null,
          rating: place.rating || details.rating || details.google_rating || null,
          google_rating: place.google_rating || details.google_rating || details.rating || null,
          user_ratings_total:
            place.user_ratings_total ||
            details.user_ratings_total ||
            details.review_count ||
            null,
          review_count:
            place.review_count ||
            details.review_count ||
            details.user_ratings_total ||
            null,
          type: place.type || details.type || null,
          lat: place.lat ?? lat,
          lng: place.lng ?? lng,
          coords,
          status: coords ? 'done' : place.status,
          rank: Number(place.rank),
        };
      } catch {
        return place;
      }
    }),
  );

  return enriched;
}

export function mergeEnrichedPlaces(
  current: GeocodedPlace[],
  incoming: GeocodedPlace[],
): { places: GeocodedPlace[]; changed: boolean } {
  const incomingByKey = new Map(
    incoming.map((p) => [`${p._idx}:${p.name.trim().toLowerCase()}`, p]),
  );

  let changed = false;

  const places = current.map((place) => {
    const next = incomingByKey.get(`${place._idx}:${place.name.trim().toLowerCase()}`);
    if (!next) return place;

    const merged: GeocodedPlace = {
      ...place,
      ...next,
      name: place.name,
      rank: Number(place.rank) || Number(next.rank) || place._idx + 1,
      coords: next.coords || place.coords,
      status: next.coords || place.coords ? 'done' : next.status || place.status,
      description: place.description || next.description || null,
      is_saved: place.is_saved ?? next.is_saved ?? false,
      isSaved: place.isSaved ?? next.isSaved ?? false,
      saved: place.saved ?? next.saved ?? false,
      is_bookmarked: place.is_bookmarked ?? next.is_bookmarked ?? false,
    };

    const keysToCheck: Array<keyof GeocodedPlace> = [
      'google_name',
      'google_place_id',
      'maps_url',
      'photo_url',
      'rating',
      'google_rating',
      'user_ratings_total',
      'review_count',
      'type',
      'country',
      'city',
      'region',
      'lat',
      'lng',
    ];

    if (
      keysToCheck.some((key) => merged[key] !== place[key]) ||
      merged.coords?.lat !== place.coords?.lat ||
      merged.coords?.lng !== place.coords?.lng
    ) {
      changed = true;
    }

    return merged;
  });

  return { places, changed };
}

export const css = {
  card: {
    position: 'relative',
    zIndex: 0,
    isolation: 'isolate',
    borderRadius: 22,
    overflow: 'hidden',
    background: '#ffffff',
    boxShadow: '0 8px 30px rgba(15,23,42,.10)',
    border: '1px solid rgba(226,232,240,0.8)',
    fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 20px',
    background: 'rgba(219, 234, 254, 0.6)',
    borderBottom: '1px solid #f9fafb',
  } as React.CSSProperties,

  headerIcon: {
    width: 20,
    height: 20,
    color: BLUE,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  headerLabel: {
    fontSize: 18,
    fontWeight: 700,
    color: TEXT,
    lineHeight: 1.25,
  } as React.CSSProperties,

  headerStatus: {
    marginLeft: 'auto',
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: 700,
  } as React.CSSProperties,

  mapWrap: {
    height: 315,
    background: '#e8ebe6',
    position: 'relative',
    zIndex: 0,
    isolation: 'isolate',
    overflow: 'hidden',
  } as React.CSSProperties,

  mapLoading: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#777',
    fontSize: 14,
    background: '#f5f3f0',
    textAlign: 'center',
    padding: '0 18px',
  } as React.CSSProperties,

  emptyMap: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#777',
    fontSize: 14,
    background: '#f5f3f0',
    textAlign: 'center',
    padding: '0 22px',
    lineHeight: 1.45,
  } as React.CSSProperties,

  mapCard: {
    position: 'absolute',
    left: '50%',
    bottom: 28,
    transform: 'translateX(-50%)',
    zIndex: 20,
    width: 'min(455px, calc(100% - 56px))',
    minHeight: 112,
    background: '#ffffff',
    borderRadius: 16,
    boxShadow: '0 10px 28px rgba(15,23,42,0.22)',
    border: `1px solid ${BLUE_BORDER}`,
    padding: '16px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  } as React.CSSProperties,

  mapCardPhotoWrap: {
    position: 'relative',
    width: 104,
    height: 82,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
    background: '#eef2f7',
  } as React.CSSProperties,

  mapCardPhoto: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  } as React.CSSProperties,

  mapCardRank: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: BLUE,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 850,
    flexShrink: 0,
    boxShadow: '0 8px 18px rgba(37,99,255,0.28)',
  } as React.CSSProperties,

  mapCardTitleRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    width: '100%',
    minWidth: 0,
  } as React.CSSProperties,

  mapCardTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: 850,
    lineHeight: 1.2,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  mapCardCountry: {
    color: BLUE,
    fontSize: 13,
    fontWeight: 850,
    flexShrink: 0,
    marginLeft: 'auto',
  } as React.CSSProperties,

  mapCardMeta: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 1.3,
    marginTop: 7,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  mapCardClose: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: 'none',
    background: '#f3f6fb',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: 20,
    lineHeight: 1,
    flexShrink: 0,
  } as React.CSSProperties,

  list: {
    padding: '12px 12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  } as React.CSSProperties,

  item: (active: boolean, hovered: boolean, hasPin: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '17px 16px',
    cursor: hasPin ? 'pointer' : 'default',
    background: active || hovered ? '#fbfdff' : '#ffffff',
    border: `1px solid ${active || hovered ? BLUE_BORDER : 'transparent'}`,
    borderRadius: 15,
    boxShadow: active ? `0 0 0 1px ${BLUE_BORDER} inset` : 'none',
    boxSizing: 'border-box',
    transform: 'none',
    transition: 'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
    opacity: hasPin ? 1 : 0.88,
  }),

  rank: (active: boolean): React.CSSProperties => ({
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: active ? BLUE_DARK : BLUE,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1,
    boxShadow: '0 4px 10px rgba(37,99,255,0.18)',
  }),

  titleRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    width: '100%',
    minWidth: 0,
  } as React.CSSProperties,

  name: {
    fontSize: 15,
    fontWeight: 850,
    color: TEXT,
    lineHeight: 1.22,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  countryInline: {
    color: BLUE,
    fontSize: 13,
    fontWeight: 850,
    flexShrink: 0,
    marginLeft: 'auto',
  } as React.CSSProperties,

  description: {
    fontSize: 14,
    color: MUTED,
    marginTop: 6,
    lineHeight: 1.35,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  } as React.CSSProperties,

  meta: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 5,
    fontWeight: 650,
  } as React.CSSProperties,

  actions: {
    marginLeft: 'auto',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as React.CSSProperties,

  bookmarkBtn: (saved: boolean): React.CSSProperties => ({
    width: 42,
    height: 42,
    borderRadius: 12,
    border: saved ? `1px solid ${BLUE}` : '1px solid transparent',
    background: saved ? BLUE : '#f8fbff',
    color: saved ? '#ffffff' : '#8aa2c8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    boxShadow: saved ? '0 8px 18px rgba(37,99,255,0.22)' : 'none',
    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease, opacity 150ms ease',
  }),

  directionsBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '11px 16px',
    borderRadius: 14,
    border: 'none',
    background: BLUE_SOFT,
    color: BLUE,
    fontSize: 14,
    fontWeight: 850,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
};