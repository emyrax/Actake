import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Compass,
  Footprints,
  MapPin,
  Navigation,
  RefreshCw,
  Target,
} from 'lucide-react';
import { GeoHuntZone } from '../types/actake';
import { DEFAULT_GEO_HUNTS } from '../data/localStore';
import { haversineMeters } from '../utils/timeUtils';
import { MascotDisplay } from './MascotDisplay';

interface HuntsViewProps {
  onLaunchGeoProof: (hunt: GeoHuntZone) => void;
}

export const HuntsView: React.FC<HuntsViewProps> = ({ onLaunchGeoProof }) => {
  const [selectedCategory, setSelectedCategory] = useState<GeoHuntZone['category']>('Running');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: 37.7749,
    lng: -122.4194,
  });
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number }>({
    lat: 37.7749,
    lng: -122.4194,
  });
  const [gpsStatus, setGpsStatus] = useState<'locating' | 'live' | 'simulated'>('locating');
  const [walkProgress, setWalkProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(1122);

  const activeHunt =
    DEFAULT_GEO_HUNTS.find((h) => h.category === selectedCategory) || DEFAULT_GEO_HUNTS[0];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const requestRealGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('simulated');
      return;
    }
    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOriginCoords(coords);
        setUserCoords(coords);
        setWalkProgress(0);
        setGpsStatus('live');
      },
      () => {
        setGpsStatus('simulated');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  useEffect(() => {
    requestRealGps();
  }, []);

  const targetLat = originCoords.lat + activeHunt.targetLatOffset;
  const targetLng = originCoords.lng + activeHunt.targetLngOffset;

  const currentLat = userCoords.lat + (targetLat - userCoords.lat) * walkProgress;
  const currentLng = userCoords.lng + (targetLng - userCoords.lng) * walkProgress;

  const distanceMeters = haversineMeters(currentLat, currentLng, targetLat, targetLng);
  const insideZone = distanceMeters <= activeHunt.radiusMeters;

  const hh = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');

  const userMapX = 64 + (34 - 64) * walkProgress;
  const userMapY = 26 + (54 - 26) * walkProgress;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <MascotDisplay
            variant="medallion"
            size="md"
            floating
            alt="Actake Geo-Hunt Mascot"
          />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#F16A2E]">
              Live Haversine Geofence Proofs
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
              GPS Geo-Hunts
            </h1>
            <p className="text-sm text-[#6B6663] mt-0.5">
              Enter the live geofence and snap verified camera proof to unlock the shared pool.
            </p>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="inline-flex items-center p-1 rounded-full bg-white border border-[#EFE2D9] shadow-[0_4px_14px_rgba(24,20,18,0.04)] self-start overflow-x-auto max-w-full">
          {(['Running', 'Campus Hunt', 'Gym Check-in'] as GeoHuntZone['category'][]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                setWalkProgress(0);
              }}
              className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[#111114] text-white'
                  : 'text-[#6B6663] hover:text-[#111114]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 2-Column Tactical Map + Geofence Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Interactive Tactical Map */}
        <div className="lg:col-span-7 relative rounded-[28px] overflow-hidden bg-[#F3EEE8] border border-[#EFE2D9] min-h-[360px] sm:min-h-[420px] shadow-[0_10px_28px_rgba(24,20,18,0.06)]">
          <svg
            viewBox="0 0 600 400"
            className="w-full h-full object-cover absolute inset-0"
            aria-label="Interactive Geo-Hunt tactical map"
          >
            <defs>
              <radialGradient id="zonePulse" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={insideZone ? '#16A34A' : '#F16A2E'} stopOpacity="0.28" />
                <stop offset="100%" stopColor={insideZone ? '#16A34A' : '#F16A2E'} stopOpacity="0.02" />
              </radialGradient>
            </defs>
            <rect width="600" height="400" fill="#F6F1EA" />
            <path d="M0 70 Q150 40 280 90 T600 60 L600 0 L0 0 Z" fill="#E6F3E8" />
            <path d="M40 280 Q180 210 340 285 T600 260 L600 400 L0 400 Z" fill="#EBF0F7" />
            <path d="M0 160 L140 120 L310 190 L520 110 L600 140" fill="none" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" />
            <path d="M120 0 L190 180 L110 400" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
            <path d="M410 0 L350 220 L480 400" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />

            {/* Route Line from User to Target Zone */}
            <line
              x1={userMapX * 6}
              y1={userMapY * 4}
              x2="204"
              y2="216"
              stroke="#111114"
              strokeWidth="4"
              strokeDasharray="8 6"
              strokeLinecap="round"
            />

            {/* Target Geofence Rings */}
            <circle cx="204" cy="216" r="88" fill="url(#zonePulse)" />
            <circle
              cx="204"
              cy="216"
              r="58"
              fill="none"
              stroke={insideZone ? '#16A34A' : '#6B6663'}
              strokeWidth="2.5"
              strokeDasharray="5 5"
            />
            <circle cx="204" cy="216" r="14" fill={insideZone ? '#16A34A' : '#111114'} />
            <circle cx="204" cy="216" r="5" fill="#FFFFFF" />

            {/* User Live GPS Marker */}
            <g transform={`translate(${userMapX * 6}, ${userMapY * 4})`}>
              <circle r="18" fill="#FFFFFF" stroke="#F16A2E" strokeWidth="4" />
              <circle r="6" fill="#F16A2E" />
            </g>
          </svg>

          {/* Zone Distance Callout & GPS Retry */}
          <div className="relative z-10 p-4 flex items-start justify-between gap-3">
            <div className="rounded-2xl bg-white/95 border border-[#EFE2D9] px-3.5 py-2.5 shadow-xs">
              <div className="text-xs font-bold text-[#111114] tabular-nums">
                Zone 1 · {distanceMeters}m away
              </div>
              <div className="text-[11px] text-[#6B6663]">
                Radius {activeHunt.radiusMeters}m ·{' '}
                {gpsStatus === 'live'
                  ? 'Live GPS Lock'
                  : gpsStatus === 'locating'
                    ? 'Locating GPS...'
                    : 'Indoor Simulation'}
              </div>
            </div>

            <button
              type="button"
              onClick={requestRealGps}
              className="min-h-[44px] px-3.5 rounded-full bg-white/95 border border-[#EFE2D9] text-xs font-bold text-[#111114] hover:bg-white inline-flex items-center gap-1.5 shadow-xs transition-colors"
            >
              {gpsStatus === 'locating' ? (
                <RefreshCw className="w-3.5 h-3.5 text-[#F16A2E] animate-spin" />
              ) : (
                <Navigation className="w-3.5 h-3.5 text-[#F16A2E]" />
              )}
              <span>{gpsStatus === 'simulated' ? 'Retry GPS' : 'Locate'}</span>
            </button>
          </div>

          {/* Bottom Interactive GPS Walk Helper for Desktop/Indoor Evaluation */}
          <div className="absolute bottom-4 left-4 right-4 z-10 rounded-2xl bg-white/95 border border-[#EFE2D9] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-[#111114]">
              <Footprints className="w-4 h-4 text-[#F16A2E] shrink-0" />
              <span className="font-bold">Walk Toward Geofence (Indoor GPS Test)</span>
            </div>
            <div className="flex items-center gap-3 flex-1 max-w-xs">
              <input
                type="range"
                aria-label="Simulate walking toward geofence"
                min={0}
                max={1}
                step={0.05}
                value={walkProgress}
                onChange={(e) => setWalkProgress(Number(e.target.value))}
                className="w-full accent-[#16A34A] cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-[#111114] tabular-nums w-12 text-right">
                {distanceMeters}m
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Geofence Telemetry & Hunt Action Card */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          {/* Obsidian Telemetry Panel */}
          <div className="rounded-[28px] bg-[#141416] text-white p-6 space-y-5 shadow-[0_14px_32px_rgba(17,17,20,0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-3xl font-extrabold tabular-nums">
                  {hh}:{mm}:{ss}
                </div>
                <div className="text-xs text-white/65 mt-0.5">Elapsed Hunt Time</div>
              </div>

              <div
                className={`rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 ${
                  insideZone
                    ? 'bg-[#16A34A]/25 text-[#4ADE80] border border-[#16A34A]/40'
                    : 'bg-white/10 text-white/85 border border-white/15'
                }`}
              >
                {insideZone ? (
                  <CheckCircle2 className="w-4 h-4 text-[#4ADE80]" />
                ) : (
                  <Compass className="w-4 h-4 text-[#F16A2E]" />
                )}
                <span>{insideZone ? 'INSIDE ZONE' : 'APPROACHING'}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <div className="flex justify-between text-white/80 tabular-nums">
                  <span>Distance Progress</span>
                  <span>{Math.min(100, Math.round(walkProgress * 100))}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#F16A2E] to-[#4ADE80] transition-all"
                    style={{ width: `${Math.max(12, Math.round(walkProgress * 100))}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-white/70 pt-1 tabular-nums">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                  <MapPin className="w-3.5 h-3.5 text-[#F16A2E]" />
                  {currentLat.toFixed(4)}, {currentLng.toFixed(4)}
                </span>
                <span>+{activeHunt.participantCount} runners</span>
              </div>
            </div>
          </div>

          {/* Active Hunt Pool Card */}
          <div className="actake-card p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F16A2E] inline-flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  <span>Actake Hunt · {activeHunt.alarmTimeLabel}</span>
                </div>
                <h2 className="font-display text-xl font-extrabold text-[#111114] mt-1">
                  {activeHunt.title}
                </h2>
                <p className="text-xs text-[#6B6663] mt-1 leading-relaxed">
                  Requires geofence arrival + live camera proof ({activeHunt.targetItemHint}).
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-2xl font-extrabold text-[#111114] tabular-nums">
                  ${activeHunt.poolUsd}
                </div>
                <div className="text-xs text-[#6B6663]">Pool</div>
              </div>
            </div>

            <button
              type="button"
              disabled={!insideZone}
              onClick={() => onLaunchGeoProof(activeHunt)}
              className="w-full min-h-[52px] px-5 py-3 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] disabled:bg-[#EFE5DE] disabled:text-[#877F7A] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Camera className="w-4 h-4" />
              <span>
                {insideZone
                  ? 'Snap Geo-Proof to Unlock Pot'
                  : `Move Within ${activeHunt.radiusMeters}m to Unlock Camera`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
