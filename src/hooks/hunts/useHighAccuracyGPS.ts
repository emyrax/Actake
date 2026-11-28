import { useEffect, useState } from 'react';
import {
  bearingToCardinal,
  computeForwardBearing,
  computeHaversineMeters,
  isPointInsidePolygon,
} from './geoMath';
import { GeoCoordinate } from '../../types/geodrops';

export interface HighAccuracyGpsState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  distanceMeters: number | null;
  targetBearing: number | null;
  cardinalDirection: string | null;
  insideGeofence: boolean;
  watching: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
}

interface UseHighAccuracyGpsParams {
  isSensorActive: boolean;
  targetLat: number;
  targetLng: number;
  radiusMeters: number;
  geofencePolygon?: GeoCoordinate[] | null;
}

/**
 * Strictly opt-in high-accuracy GPS radar hook.
 * NEVER triggers geolocation permissions until `isSensorActive === true`.
 */
export function useHighAccuracyGPS({
  isSensorActive,
  targetLat,
  targetLng,
  radiusMeters,
  geofencePolygon,
}: UseHighAccuracyGpsParams): HighAccuracyGpsState {
  const [state, setState] = useState<HighAccuracyGpsState>({
    lat: null,
    lng: null,
    accuracy: null,
    distanceMeters: null,
    targetBearing: null,
    cardinalDirection: null,
    insideGeofence: false,
    watching: false,
    error: null,
    lastUpdatedAt: null,
  });

  useEffect(() => {
    if (!isSensorActive) {
      setState((prev) => ({
        ...prev,
        watching: false,
        error: null,
      }));
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        watching: false,
        error: 'Hardware GPS is unavailable in this browser. Switch to Indoor Demo Mode to test.',
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      watching: true,
      error: null,
    }));

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : 50;
        const distanceMeters = computeHaversineMeters(lat, lng, targetLat, targetLng);
        const targetBearing = computeForwardBearing(lat, lng, targetLat, targetLng);
        const cardinalDirection = bearingToCardinal(targetBearing);
        const insidePoly =
          geofencePolygon && geofencePolygon.length >= 3
            ? isPointInsidePolygon(lat, lng, geofencePolygon)
            : false;
        const insideGeofence = distanceMeters <= radiusMeters || insidePoly;

        setState({
          lat,
          lng,
          accuracy,
          distanceMeters,
          targetBearing,
          cardinalDirection,
          insideGeofence,
          watching: true,
          error: null,
          lastUpdatedAt: Date.now(),
        });
      },
      (geoErr) => {
        let message = 'Unable to acquire high-accuracy GPS fix.';
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          message =
            'Location permission was denied. Allow GPS access in your browser settings or switch to Indoor Demo Mode.';
        } else if (geoErr.code === geoErr.POSITION_UNAVAILABLE) {
          message = 'GPS satellite fix unavailable indoors. Step near open sky or use Indoor Demo Mode.';
        } else if (geoErr.code === geoErr.TIMEOUT) {
          message = 'GPS fix timed out (10s). Keep moving toward clear sky or try again.';
        }
        setState((prev) => ({
          ...prev,
          watching: false,
          error: message,
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isSensorActive, targetLat, targetLng, radiusMeters, geofencePolygon]);

  return state;
}
