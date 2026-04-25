import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  css,
  displayName,
  enrichPlacesWithGoogleDetails,
  extractPlaces,
  fallbackCountryFromInput,
  GeocodedPlace,
  hydrationCache,
  hydrationDone,
  hydrationInFlight,
  LocationInput,
  LocationPlace,
  makeNumberedIcon,
  mergeEnrichedPlaces,
  normalizePlace,
  patchBackendLocations,
  persistSavedPlace,
  placeKey,
  ratingMeta,
} from '../utils/locationCardUtils';

interface LocationCardProps {
  location?: LocationInput;
  language?: string;
  processId?: string;
}

function BoundsFitter({
  places,
}: {
  places: GeocodedPlace[];
}) {
  const map = useMap();

  useEffect(() => {
    const valid = places.filter((p) => p.coords);
    if (!valid.length) return;

    const timer = window.setTimeout(() => {
      map.invalidateSize();

      if (valid.length === 1) {
        map.setView([valid[0].coords!.lat, valid[0].coords!.lng], 14, {
          animate: true,
        });
        return;
      }

      const bounds = L.latLngBounds(
        valid.map((p) => [p.coords!.lat, p.coords!.lng] as [number, number]),
      );

      map.fitBounds(bounds, {
        paddingTopLeft: [28, 28],
        paddingBottomRight: [28, 42],
        maxZoom: 13,
        animate: true,
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [map, places]);

  return null;
}

function ActiveFlyer({ place }: { place: GeocodedPlace | null }) {
  const map = useMap();

  useEffect(() => {
    if (!place?.coords) return;

    const zoom = 14;
    const latLng = L.latLng(place.coords.lat, place.coords.lng);
    const projected = map.project(latLng, zoom);

    const offsetCenter = map.unproject(
      L.point(projected.x, projected.y + 44),
      zoom,
    );

    map.flyTo(offsetCenter, zoom, {
      animate: true,
      duration: 0.7,
    });
  }, [map, place?._idx]);

  return null;
}

function MapInvalidator() {
  const map = useMap();

  useEffect(() => {
    const timers = [80, 250, 600].map((delay) =>
      window.setTimeout(() => map.invalidateSize(), delay),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [map]);

  return null;
}

export const LocationCard: React.FC<LocationCardProps> = ({
  location,
  processId,
}) => {
  const [places, setPlaces] = useState<GeocodedPlace[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const rawPlaces = useMemo<LocationPlace[]>(() => {
    return extractPlaces(location);
  }, [location]);

  const fallbackCountry = useMemo(() => {
    return fallbackCountryFromInput(location);
  }, [location]);

  const normalizedPlaces = useMemo<GeocodedPlace[]>(() => {
    return rawPlaces
      .map((p, i) => normalizePlace(p, i, fallbackCountry))
      .filter((p): p is GeocodedPlace => !!p);
  }, [rawPlaces, fallbackCountry]);

  const normalizedSignature = useMemo(() => {
    return JSON.stringify(
      normalizedPlaces.map((p) => ({
        name: p.name,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        city: p.city ?? null,
        region: p.region ?? null,
        country: p.country ?? null,
      })),
    );
  }, [normalizedPlaces]);

  useEffect(() => {
    const initialSaved = new Set<string>();

    normalizedPlaces.forEach((place) => {
      if (
        place.is_saved ||
        place.isSaved ||
        place.saved ||
        place.is_bookmarked
      ) {
        initialSaved.add(placeKey(place));
      }
    });

    if (initialSaved.size) {
      setSavedKeys((prev) => {
        const next = new Set(prev);
        initialSaved.forEach((key) => next.add(key));
        return next;
      });
    }
  }, [normalizedSignature, normalizedPlaces]);

  useEffect(() => {
    let cancelled = false;

    setPlaces(normalizedPlaces);
    setActiveIdx((prev) =>
      prev !== null && normalizedPlaces.some((p) => p._idx === prev)
        ? prev
        : null,
    );

    const needsBackendHydration =
      !!processId &&
      normalizedPlaces.length > 0 &&
      normalizedPlaces.some((p) => !p.coords);

    if (!needsBackendHydration) {
      setIsHydrating(false);
      return () => {
        cancelled = true;
      };
    }

    const hydrationKey = `${processId}:${normalizedSignature}`;

    if (hydrationDone.has(hydrationKey)) {
      const cached = hydrationCache.get(hydrationKey);

      if (cached?.length) {
        setPlaces((prev) => {
          const { places: merged } = mergeEnrichedPlaces(prev, cached);
          return merged;
        });

        setIsHydrating(false);
        return () => {
          cancelled = true;
        };
      }

      hydrationDone.delete(hydrationKey);
    }

    setIsHydrating(true);
    setPlaces((prev) =>
      prev.map((p) => ({
        ...p,
        rank: Number(p.rank) || p._idx + 1,
        status: p.coords ? 'done' : 'loading',
      })),
    );

    let promise = hydrationInFlight.get(hydrationKey);

    if (!promise) {
      promise = patchBackendLocations(processId, normalizedPlaces);
      hydrationInFlight.set(hydrationKey, promise);
    }

    promise
      .then((enriched) => {
        if (cancelled) return;

        if (enriched?.length) {
          const cleaned = enriched.map((p) => ({
            ...p,
            rank: Number(p.rank) || p._idx + 1,
            status: p.coords ? ('done' as const) : ('failed' as const),
          }));

          hydrationDone.add(hydrationKey);
          hydrationCache.set(hydrationKey, cleaned);

          setPlaces((prev) => {
            const { places: merged } = mergeEnrichedPlaces(prev, cleaned);
            return merged;
          });
        } else {
          setPlaces((prev) =>
            prev.map((p) => ({
              ...p,
              rank: Number(p.rank) || p._idx + 1,
              status: p.coords ? 'done' : 'failed',
            })),
          );
        }
      })
      .finally(() => {
        hydrationInFlight.delete(hydrationKey);

        if (!cancelled) {
          setIsHydrating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedSignature, normalizedPlaces, processId]);

  const googleEnrichmentSignature = useMemo(() => {
    return JSON.stringify(
      places.map((p) => ({
        idx: p._idx,
        name: p.name,
        lat: p.coords?.lat ?? null,
        lng: p.coords?.lng ?? null,
        photo: !!p.photo_url,
        googleName: !!p.google_name,
        rating: p.rating ?? p.google_rating ?? null,
        reviews: p.user_ratings_total ?? p.review_count ?? null,
      })),
    );
  }, [places]);

  useEffect(() => {
    let cancelled = false;

    const needsGoogleDetails = places.some((place) =>
      place.coords &&
      (!place.photo_url ||
        !place.google_name ||
        place.rating == null ||
        place.google_rating == null ||
        place.user_ratings_total == null),
    );

    if (!needsGoogleDetails) {
      return () => {
        cancelled = true;
      };
    }

    enrichPlacesWithGoogleDetails(places).then((enriched) => {
      if (cancelled) return;

      setPlaces((prev) => {
        const { places: merged, changed } = mergeEnrichedPlaces(prev, enriched);
        return changed ? merged : prev;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [googleEnrichmentSignature]);

  const mappablePlaces = useMemo(() => {
    return places.filter((p) => p.coords);
  }, [places]);

  const hasRawPlaces = rawPlaces.length > 0;
  const hasDisplayPlaces = places.length > 0;
  const hasMappablePlaces = mappablePlaces.length > 0;

  const activePlace = useMemo(() => {
    if (activeIdx === null) return null;
    return places.find((place) => place._idx === activeIdx) ?? null;
  }, [activeIdx, places]);

  const defaultCenter = useMemo<[number, number]>(() => {
    const first = mappablePlaces[0]?.coords;
    return first ? [first.lat, first.lng] : [47.5, 12.5];
  }, [mappablePlaces]);

  const handleItemClick = useCallback((place: GeocodedPlace) => {
    setActiveIdx((prev) => (prev === place._idx ? null : place._idx));
  }, []);

  const handleDirections = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, place: GeocodedPlace) => {
      event.stopPropagation();

      const destination = place.coords
        ? `${place.coords.lat},${place.coords.lng}`
        : encodeURIComponent(
            [
              place.name,
              place.city,
              place.region,
              place.country,
            ]
              .filter(Boolean)
              .join(', '),
          );

      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
        '_blank',
        'noopener,noreferrer',
      );
    },
    [],
  );

  const handleSave = useCallback(
    async (
      event: React.MouseEvent<HTMLButtonElement>,
      place: GeocodedPlace,
    ) => {
      event.stopPropagation();

      const key = placeKey(place);
      const wasSaved = savedKeys.has(key);

      setSavedKeys((prev) => {
        const next = new Set(prev);
        if (wasSaved) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });

      setPlaces((prev) =>
        prev.map((p) =>
          p._idx === place._idx
            ? {
                ...p,
                is_saved: !wasSaved,
                isSaved: !wasSaved,
                saved: !wasSaved,
                is_bookmarked: !wasSaved,
              }
            : p,
        ),
      );

      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      try {
        await persistSavedPlace(!wasSaved, processId, {
          ...place,
          is_saved: !wasSaved,
          isSaved: !wasSaved,
          saved: !wasSaved,
          is_bookmarked: !wasSaved,
        });
      } catch (err) {
        console.error('Saving place failed', err);
      } finally {
        setSavingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [processId, savedKeys],
  );

  const headerCount = places.length || rawPlaces.length;
  const headerLabel = `${headerCount} ${headerCount === 1 ? 'PLACE' : 'PLACES'}`;

  return (
    <div style={css.card}>
      <style>
        {`
          .recolekt-location-card .leaflet-container {
            width: 100%;
            height: 100%;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          }

          .recolekt-location-card .leaflet-control-zoom {
            border: 1px solid rgba(15, 23, 42, 0.18);
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(15,23,42,0.12);
          }

          .recolekt-location-card .leaflet-control-zoom a {
            color: #111827;
            font-weight: 900;
            font-size: 22px;
            width: 42px;
            height: 42px;
            line-height: 40px;
          }

          .recolekt-location-card .leaflet-control-attribution {
            font-size: 11px;
          }

          .recolekt-location-marker {
            background: transparent;
            border: none;
          }
        `}
      </style>

      <div className="recolekt-location-card">
        <div style={css.header}>
          <div style={css.headerIcon}>
            <svg
              width="27"
              height="27"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>

          <span style={css.headerLabel}>{headerLabel}</span>

          {isHydrating && (
            <span style={css.headerStatus}>locating…</span>
          )}
        </div>

        <div style={css.mapWrap}>
          {!hasDisplayPlaces ? (
            <div style={css.emptyMap}>
              {hasRawPlaces
                ? 'Exact map pins are unavailable because the reel does not reveal real place names.'
                : 'No exact places were found for this reel.'}
            </div>
          ) : isHydrating && !hasMappablePlaces ? (
            <div style={css.mapLoading}>Locating map pins…</div>
          ) : !hasMappablePlaces ? (
            <div style={css.emptyMap}>
              Exact map pins are unavailable for these places.
            </div>
          ) : (
            <>
              <MapContainer
                center={defaultCenter}
                zoom={6}
                minZoom={2}
                maxZoom={18}
                scrollWheelZoom={false}
                style={{ width: '100%', height: '100%' }}
              >
                <TileLayer
                  attribution="&copy; Google Maps"
                  url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                  subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                />

                <MapInvalidator />
                <BoundsFitter places={mappablePlaces} />
                <ActiveFlyer place={activePlace} />

                {mappablePlaces.map((place) => (
                  <Marker
                    key={`marker-${place._idx}`}
                    position={[place.coords!.lat, place.coords!.lng]}
                    icon={makeNumberedIcon(
                      place.rank,
                      activeIdx === place._idx,
                    )}
                    eventHandlers={{
                      click: () => {
                        setActiveIdx((prev) =>
                          prev === place._idx ? null : place._idx,
                        );
                      },
                    }}
                  />
                ))}
              </MapContainer>

              {activePlace && (
                <div style={css.mapCard}>
                  {activePlace.photo_url ? (
                    <img
                      src={activePlace.photo_url}
                      alt={displayName(activePlace)}
                      style={css.mapCardPhoto}
                      loading="lazy"
                    />
                  ) : (
                    <div style={css.mapCardRank}>{activePlace.rank}</div>
                  )}

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={css.mapCardTitleRow}>
                      <div style={css.mapCardTitle}>{displayName(activePlace)}</div>

                      {activePlace.country && (
                        <div style={css.mapCardCountry}>
                          {activePlace.country}
                        </div>
                      )}
                    </div>

                    {ratingMeta(activePlace) && (
                      <div style={css.mapCardMeta}>
                        {ratingMeta(activePlace)}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    style={css.mapCardClose}
                    onClick={() => setActiveIdx(null)}
                    aria-label="Close place card"
                  >
                    ×
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {hasDisplayPlaces && (
          <div style={css.list}>
            {places.map((place) => {
              const key = placeKey(place);
              const active = activeIdx === place._idx;
              const hovered = hoverIdx === place._idx;
              const hasPin = !!place.coords;
              const saved =
                savedKeys.has(key) ||
                !!place.is_saved ||
                !!place.isSaved ||
                !!place.saved ||
                !!place.is_bookmarked;
              const saving = savingKeys.has(key);
              const typeLabel = place.type || place.place_type || '';
              const countryLabel = place.country || '';

              return (
                <div
                  key={`place-${place._idx}`}
                  style={css.item(active, hovered, hasPin)}
                  onClick={() => handleItemClick(place)}
                  onMouseEnter={() => setHoverIdx(place._idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  <div style={css.rank(active)}>
                    {place.rank}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={css.titleRow}>
                      <div style={css.name}>{place.name}</div>

                      {countryLabel && (
                        <span style={css.countryInline}>{countryLabel}</span>
                      )}
                    </div>

                    {place.description ? (
                      <div style={css.description}>
                        {place.description}
                      </div>
                    ) : typeLabel ? (
                      <div style={css.meta}>{typeLabel}</div>
                    ) : null}
                  </div>

                  <div style={css.actions}>
                    <button
                      type="button"
                      style={{
                        ...css.bookmarkBtn(saved),
                        opacity: saving ? 0.65 : 1,
                      }}
                      onClick={(event) => handleSave(event, place)}
                      disabled={saving}
                      aria-label={saved ? 'Remove saved place' : 'Save place'}
                      title={saved ? 'Saved' : 'Save place'}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill={saved ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      style={css.directionsBtn}
                      onClick={(event) => handleDirections(event, place)}
                      aria-label={`Directions to ${place.name}`}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      Directions
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationCard;