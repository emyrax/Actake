import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoCoordinate, GeoDropRadiusMeters } from '../../types/geodrops';

interface GeofenceMapProps {
  center: GeoCoordinate;
  targetPin: GeoCoordinate | null;
  radiusMeters: GeoDropRadiusMeters;
  polygonPoints?: GeoCoordinate[] | null;
  /** Optional live hunter GPS (or simulated indoor) coordinate */
  userLocation?: GeoCoordinate | null;
  /** Optional GPS accuracy radius in meters */
  userAccuracyMeters?: number | null;
  /** Whether the hunter is currently inside the mapped geofence */
  insideGeofence?: boolean;
  /** Interactive editing mode for Create Hunt ('pin' drops center pin, 'polygon' adds area boundary corners) */
  interactionMode?: 'readonly' | 'pin' | 'polygon';
  onMapClick?: (coord: GeoCoordinate) => void;
  heightClassName?: string;
  /** 'card' for embedded pickers, 'fullscreen' for edge-to-edge hunt navigation */
  variant?: 'card' | 'fullscreen';
  /** Increment to smoothly recenter/fit the map onto the hunt target (and user if present) */
  recenterSignal?: number;
}

/**
 * Interactive real-world Leaflet OpenStreetMap component for:
 * 1. Mapping real-world geofence areas (circle radius or custom polygon boundary) during Create Hunt.
 * 2. Full-screen real-time GPS location & geofence navigation during an active hunt.
 */
export const GeofenceMap: React.FC<GeofenceMapProps> = ({
  center,
  targetPin,
  radiusMeters,
  polygonPoints,
  userLocation,
  userAccuracyMeters,
  insideGeofence = false,
  interactionMode = 'readonly',
  onMapClick,
  heightClassName = 'h-[280px] sm:h-[320px]',
  variant = 'card',
  recenterSignal = 0,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const interactionModeRef = useRef(interactionMode);

  onMapClickRef.current = onMapClick;
  interactionModeRef.current = interactionMode;

  // Initialize Leaflet map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [center.lat, center.lng],
      zoom: variant === 'fullscreen' ? 17 : 17,
      zoomControl: variant !== 'fullscreen',
      attributionControl: true,
    });

    if (variant === 'fullscreen') {
      L.control.zoom({ position: 'bottomleft' }).addTo(map);
    }

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);
    overlayLayerRef.current = overlayGroup;
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (interactionModeRef.current === 'readonly') return;
      onMapClickRef.current?.({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      });
    });

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 140);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        map.invalidateSize({ animate: false });
      });
      observer.observe(el);
    }

    return () => {
      window.clearTimeout(resizeTimer);
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      overlayLayerRef.current = null;
    };
  }, [variant]);

  // Recenter smoothly when explicit center prop changes significantly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const current = map.getCenter();
    const diff = Math.abs(current.lat - center.lat) + Math.abs(current.lng - center.lng);
    if (diff > 0.0008) {
      map.setView([center.lat, center.lng], Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [center.lat, center.lng]);

  // Explicit recenter button signal (fits both user and target when active, else centers on target)
  useEffect(() => {
    if (recenterSignal === 0) return;
    const map = mapRef.current;
    if (!map) return;

    if (userLocation && targetPin) {
      const bounds = L.latLngBounds(
        [userLocation.lat, userLocation.lng],
        [targetPin.lat, targetPin.lng]
      );
      map.fitBounds(bounds, {
        padding: [72, 72],
        maxZoom: 18,
        animate: true,
      });
    } else if (targetPin) {
      map.setView([targetPin.lat, targetPin.lng], 17, { animate: true });
    } else {
      map.setView([center.lat, center.lng], 17, { animate: true });
    }
  }, [recenterSignal]);

  // Redraw geofence overlays (target circle, custom polygon area, user GPS dot & bearing line)
  useEffect(() => {
    const layerGroup = overlayLayerRef.current;
    const map = mapRef.current;
    if (!layerGroup || !map) return;

    layerGroup.clearLayers();

    const zoneColor = insideGeofence ? '#16A34A' : '#F16A2E';

    // 1. Draw custom mapped geofence polygon area if present
    if (polygonPoints && polygonPoints.length >= 2) {
      const latLngs = polygonPoints.map((p) => [p.lat, p.lng] as [number, number]);
      if (polygonPoints.length >= 3) {
        L.polygon(latLngs, {
          color: zoneColor,
          weight: 2.5,
          fillColor: zoneColor,
          fillOpacity: 0.22,
          dashArray: insideGeofence ? undefined : '6 6',
        }).addTo(layerGroup);
      } else {
        L.polyline(latLngs, {
          color: zoneColor,
          weight: 2.5,
          dashArray: '5 5',
        }).addTo(layerGroup);
      }

      if (interactionMode === 'polygon') {
        polygonPoints.forEach((pt, idx) => {
          L.circleMarker([pt.lat, pt.lng], {
            radius: 6,
            color: '#111114',
            weight: 2,
            fillColor: '#FFFFFF',
            fillOpacity: 1,
          })
            .bindTooltip(`Corner ${idx + 1}`, { direction: 'top', offset: [0, -6] })
            .addTo(layerGroup);
        });
      }
    }

    // 2. Draw primary chest geofence radius circle & target chest pin
    if (targetPin) {
      L.circle([targetPin.lat, targetPin.lng], {
        radius: radiusMeters,
        color: zoneColor,
        weight: 2.5,
        fillColor: zoneColor,
        fillOpacity: polygonPoints && polygonPoints.length >= 3 ? 0.08 : 0.22,
        dashArray: insideGeofence ? undefined : '6 6',
      }).addTo(layerGroup);

      L.circleMarker([targetPin.lat, targetPin.lng], {
        radius: 9,
        color: '#FFFFFF',
        weight: 3,
        fillColor: insideGeofence ? '#16A34A' : '#F16A2E',
        fillOpacity: 1,
      })
        .bindTooltip('GeoDrop Target', { direction: 'top', offset: [0, -10] })
        .addTo(layerGroup);
    }

    // 3. Draw live user GPS position, accuracy ring, and vector line to target
    if (userLocation) {
      if (userAccuracyMeters && userAccuracyMeters > 0 && userAccuracyMeters < 2000) {
        L.circle([userLocation.lat, userLocation.lng], {
          radius: userAccuracyMeters,
          color: '#2563EB',
          weight: 1.2,
          fillColor: '#3B82F6',
          fillOpacity: 0.14,
        }).addTo(layerGroup);
      }

      if (targetPin) {
        L.polyline(
          [
            [userLocation.lat, userLocation.lng],
            [targetPin.lat, targetPin.lng],
          ],
          {
            color: '#111114',
            weight: 2.5,
            opacity: 0.8,
            dashArray: '6 6',
          }
        ).addTo(layerGroup);
      }

      L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 7.5,
        color: '#FFFFFF',
        weight: 3,
        fillColor: '#2563EB',
        fillOpacity: 1,
      })
        .bindTooltip('You', { direction: 'top', offset: [0, -8] })
        .addTo(layerGroup);
    }
  }, [targetPin, radiusMeters, polygonPoints, userLocation, userAccuracyMeters, insideGeofence, interactionMode]);

  const wrapperClass =
    variant === 'fullscreen'
      ? 'w-full h-full bg-[#E8E2DC] relative z-0'
      : `w-full ${heightClassName} rounded-2xl overflow-hidden border border-[#E6D6CC] bg-[#EFE8E2] relative z-0`;

  return (
    <div
      ref={containerRef}
      aria-label="Interactive real-world geofence map"
      className={wrapperClass}
    />
  );
};
