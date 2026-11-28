import { GeoCoordinate } from '../../types/geodrops';

const EARTH_RADIUS_METERS = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Great-circle Haversine distance in meters between two WGS84 coordinates.
 */
export function computeHaversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/**
 * Initial forward compass bearing in degrees [0, 360) from point A to point B.
 */
export function computeForwardBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lng2 - lng1);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

/**
 * Shortest signed angular difference in degrees [-180, +180]:
 * positive = turn right, negative = turn left, 0 = straight ahead.
 */
export function computeRelativeBearingDelta(
  targetBearingDeg: number,
  deviceHeadingDeg: number
): number {
  const raw = ((targetBearingDeg - deviceHeadingDeg + 540) % 360) - 180;
  return raw === -180 ? 180 : raw;
}

/**
 * Human-readable cardinal direction (e.g., "North-East", "South") for a 0-360 bearing.
 */
export function bearingToCardinal(bearingDeg: number): string {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  const labels = [
    'North',
    'North-East',
    'East',
    'South-East',
    'South',
    'South-West',
    'West',
    'North-West',
  ];
  const idx = Math.round(normalized / 45) % 8;
  return labels[idx];
}

/**
 * Turn cue from a signed relative bearing delta [-180, +180].
 */
export function relativeDeltaToCue(deltaDeg: number): string {
  const abs = Math.abs(deltaDeg);
  if (abs <= 18) return 'Straight Ahead';
  if (abs >= 150) return 'Behind You — Turn Around';
  if (deltaDeg > 0) {
    return abs <= 65 ? 'Slight Right' : 'Turn Right';
  }
  return abs <= 65 ? 'Slight Left' : 'Turn Left';
}

/**
 * Ray-casting point-in-polygon check for custom mapped geofencing areas.
 */
export function isPointInsidePolygon(
  lat: number,
  lng: number,
  polygon: GeoCoordinate[] | null | undefined
): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Compute centroid and effective enclosing radius for a mapped geofence polygon.
 */
export function computePolygonCentroid(polygon: GeoCoordinate[]): {
  centroid: GeoCoordinate;
  maxRadiusMeters: number;
} {
  if (polygon.length === 0) {
    return { centroid: { lat: 0, lng: 0 }, maxRadiusMeters: 25 };
  }
  const lat = polygon.reduce((sum, p) => sum + p.lat, 0) / polygon.length;
  const lng = polygon.reduce((sum, p) => sum + p.lng, 0) / polygon.length;
  let maxRadiusMeters = 0;
  for (const p of polygon) {
    const d = computeHaversineMeters(lat, lng, p.lat, p.lng);
    if (d > maxRadiusMeters) maxRadiusMeters = d;
  }
  return {
    centroid: { lat, lng },
    maxRadiusMeters: Math.max(15, Math.round(maxRadiusMeters)),
  };
}

/**
 * Offset a WGS84 coordinate by `distanceMeters` along `bearingDeg` (used by Indoor Demo Mode).
 */
export function offsetCoordinateByDistance(
  originLat: number,
  originLng: number,
  distanceMeters: number,
  bearingDeg: number
): GeoCoordinate {
  const angularDist = distanceMeters / EARTH_RADIUS_METERS;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(originLat);
  const lng1 = toRad(originLng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
      Math.cos(lat1) * Math.sin(angularDist) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: toDeg(lat2),
    lng: ((toDeg(lng2) + 540) % 360) - 180,
  };
}

export function formatDistanceLabel(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(2)}km`;
}
