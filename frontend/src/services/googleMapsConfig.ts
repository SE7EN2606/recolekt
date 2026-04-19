import type { Libraries } from '@react-google-maps/api';

const MAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? '';

export const GOOGLE_MAPS_LOADER = {
  id:               'google-map-script',
  googleMapsApiKey: MAPS_KEY,
  libraries:        ['marker'] as Libraries,
} as const satisfies { id: string; googleMapsApiKey: string; libraries: Libraries };