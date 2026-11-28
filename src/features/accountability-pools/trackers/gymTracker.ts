import type { TrackProofPayload } from '../types';

export interface GymCoordinateSample {
  lat: number;
  lng: number;
  accuracyMeters: number;
  distanceMeters: number;
  insideZone: boolean;
  timestampMs: number;
}

export interface GymTrackerState {
  active: boolean;
  insideZone: boolean;
  currentDistanceMeters: number | null;
  accuracyMeters: number | null;
  verifiedDwellSeconds: number;
  verifiedMinutes: number;
  samples: GymCoordinateSample[];
  error: string | null;
}

const EARTH_RADIUS_M = 6_371_000;

export function computeHaversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes a deterministic SHA-256 proof_hash over all verified in-zone gym geolocation samples.
 */
export async function buildGymDwellProof(params: {
  wallet: string;
  poolId: string;
  dayIndex: number;
  gymLat: number;
  gymLng: number;
  radiusMeters: number;
  verifiedMinutes: number;
  samples: GymCoordinateSample[];
}): Promise<TrackProofPayload> {
  const inZoneSamples = params.samples
    .filter((s) => s.insideZone)
    .slice(-120)
    .map((s) => ({
      lat: Number(s.lat.toFixed(5)),
      lng: Number(s.lng.toFixed(5)),
      acc: Math.round(s.accuracyMeters),
      dist: Math.round(s.distanceMeters),
      ts: s.timestampMs,
    }));

  const canonicalJson = JSON.stringify({
    track: 'gym',
    wallet: params.wallet,
    poolId: params.poolId,
    dayIndex: params.dayIndex,
    gym: {
      lat: Number(params.gymLat.toFixed(5)),
      lng: Number(params.gymLng.toFixed(5)),
      radiusMeters: params.radiusMeters,
    },
    verifiedMinutes: params.verifiedMinutes,
    samples: inZoneSamples,
  });

  const proofHash = await sha256Hex(canonicalJson);
  return {
    track: 'gym',
    metricAchieved: params.verifiedMinutes,
    proofHash,
    canonicalJson,
    sampleCount: inZoneSamples.length,
    collectedAtIso: new Date().toISOString(),
  };
}

/**
 * Starts an opt-in `navigator.geolocation.watchPosition` dwell monitor verifying the participant
 * remains within `radiusMeters` (default 150m) of the gym coordinates.
 * Returns a cleanup stop function so sensors shut down immediately when stopped or unmounted.
 */
export function startGymGeofenceWatcher(params: {
  gymLat: number;
  gymLng: number;
  radiusMeters?: number;
  onUpdate: (state: GymTrackerState) => void;
}): () => void {
  const radius = params.radiusMeters ?? 150;
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    params.onUpdate({
      active: false,
      insideZone: false,
      currentDistanceMeters: null,
      accuracyMeters: null,
      verifiedDwellSeconds: 0,
      verifiedMinutes: 0,
      samples: [],
      error: 'Geolocation is unavailable in this browser.',
    });
    return () => {};
  }

  let samples: GymCoordinateSample[] = [];
  let insideZone = false;
  let currentDistanceMeters: number | null = null;
  let accuracyMeters: number | null = null;
  let verifiedDwellSeconds = 0;
  let lastTickMs = Date.now();
  let lastError: string | null = null;
  let stopped = false;

  const emit = () => {
    if (stopped) return;
    params.onUpdate({
      active: !stopped,
      insideZone,
      currentDistanceMeters,
      accuracyMeters,
      verifiedDwellSeconds,
      verifiedMinutes: Math.floor(verifiedDwellSeconds / 60),
      samples: [...samples],
      error: lastError,
    });
  };

  // Increment verified dwell timer strictly while inside the 150m gym geofence
  const tickId = window.setInterval(() => {
    const now = Date.now();
    const deltaSec = Math.max(0, Math.min(5, Math.round((now - lastTickMs) / 1000)));
    lastTickMs = now;
    if (insideZone && deltaSec > 0) {
      verifiedDwellSeconds += deltaSec;
      emit();
    }
  }, 1000);

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      const dist = computeHaversineMeters(lat, lng, params.gymLat, params.gymLng);
      const isInside = dist <= radius;

      insideZone = isInside;
      currentDistanceMeters = Math.round(dist);
      accuracyMeters = Math.round(acc);
      lastError = null;

      const lastSample = samples[samples.length - 1];
      const now = Date.now();
      if (!lastSample || now - lastSample.timestampMs >= 10_000) {
        samples = [
          ...samples.slice(-119),
          {
            lat,
            lng,
            accuracyMeters: acc,
            distanceMeters: dist,
            insideZone: isInside,
            timestampMs: now,
          },
        ];
      }
      emit();
    },
    (geoErr) => {
      lastError =
        geoErr.code === geoErr.PERMISSION_DENIED
          ? 'Location permission denied. Allow GPS access to verify gym attendance.'
          : geoErr.message || 'Unable to lock GPS position.';
      insideZone = false;
      emit();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 15_000,
    }
  );

  emit();

  return () => {
    stopped = true;
    window.clearInterval(tickId);
    navigator.geolocation.clearWatch(watchId);
  };
}
