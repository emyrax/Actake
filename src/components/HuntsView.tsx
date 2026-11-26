import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Compass,
  Footprints,
  MapPin,
  Navigation,
  Target,
} from 'lucide-react';
import { GeoHuntZone } from '../types/actake';
import { DEFAULT_GEO_HUNTS } from '../data/localStore';
import { haversineMeters } from '../utils/timeUtils';

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
  const [walkProgress, setWalkProgress] = useState(0); // 0..1 interactive GPS step helper
  const [elapsedSeconds, setElapsedSeconds] = useState(1122); // 00:18:42

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

  // Compute target geofence center relative to user's initial origin
  const targetLat = originCoords.lat + activeHunt.targetLatOffset;
  const targetLng = originCoords.lng + activeHunt.targetLngOffset;

  // Interpolated position if user uses the indoor GPS walk tester
  const currentLat = userCoords.lat + (targetLat - userCoords.lat) * walkProgress;
  const currentLng = userCoords.lng + (targetLng - userCoords.lng) * walkProgress;

  const distanceMeters = haversineMeters(currentLat, currentLng, targetLat, targetLng);
  const insideZone = distanceMeters <= activeHunt.radiusMeters;

  const hh = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');

  // Map visual user marker position interpolating toward target zone (35%, 45%)
  const userMapX = 64 + (34 - 64) * walkProgress;
  const userMapY = 26 + (54 - 26) * walkProgress;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#181E25] tracking-tight">
            GPS Geo-Hunts
          </h1>
          <p className="text-sm text-[#5E6873] mt-1">
            Enter the live Haversine geofence and snap verified camera proof to unlock the shared
            pool.
          </p>
        </div>

        {/* Category Filter Tabs */}
        <div className="inline-flex items-center p-1 rounded-xl bg-[#EFEAE3] self-start">
          {(['Running', 'Campus Hunt', 'Gym Check-in'] as GeoHuntZone['category'][]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                setWalkProgress(0);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-white text-[#181E25] shadow-xs'
                  : 'text-[#5E6873] hover:text-[#181E25]'
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
        <div className="lg:col-span-7 relative rounded-3xl overflow-hidden bg-[#F3EEE8] border border-[#EAE4DC] min-h-[340px] sm:min-h-[410px]">
          <svg
            viewBox="0 0 600 400"
            className="w-full h-full object-cover absolute inset-0"
            aria-label="Interactive Geo-Hunt tactical map"
          >
            <defs>
              <radialGradient id="zonePulse" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={insideZone ? '#1D8348' : '#3B82F6'} stopOpacity="0.28" />
                <stop offset="100%" stopColor={insideZone ? '#1D8348' : '#3B82F6'} stopOpacity="0.02" />
              </radialGradient>
            </defs>
            {/* Pastel Terrain & Roads matching screenshot */}
            <rect width="600" height="400" fill="#F4F1EB" />
            <path d="M0 70 Q150 40 280 90 T600 60 L600 0 L0 0 Z" fill="#E6F2E8" />
            <path d="M40 280 Q180 210 340 285 T600 260 L600 400 L0 400 Z" fill="#E9EFF7" />
            <path d="M0 160 L140 120 L310 190 L520 110 L600 140" fill="none" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" />
            <path d="M120 0 L190 180 L110 400" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
            <path d="M410 0 L350 220 L480 400" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />

            {/* Route Line from User to Target Zone */}
            <line
              x1={userMapX * 6}
              y1={userMapY * 4}
              x2="204"
              y2="216"
              stroke="#181E25"
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
              stroke={insideZone ? '#1D8348' : '#64748B'}
              strokeWidth="2.5"
              strokeDasharray="5 5"
            />
            <circle cx="204" cy="216" r="14" fill={insideZone ? '#1D8348' : '#181E25'} />
            <circle cx="204" cy="216" r="5" fill="#FFFFFF" />

            {/* User Live GPS Marker */}
            <g transform={`translate(${userMapX * 6}, ${userMapY * 4})`}>
              <circle r="18" fill="#FFFFFF" stroke="#EC6B3F" strokeWidth="4" />
              <circle r="6" fill="#EC6B3F" />
            </g>
          </svg>

          {/* Zone Distance Callout */}
          <div className="relative z-10 p-4 flex items-start justify-between gap-3">
            <div className="rounded-xl bg-white/95 border border-[#EAE4DC] px-3.5 py-2 shadow-xs">
              <div className="text-xs font-bold text-[#181E25] tabular-nums">
                Zone 1 · {distanceMeters}m away
              </div>
              <div className="text-[11px] text-[#5E6873]">
                Geofence radius: {activeHunt.radiusMeters}m · {gpsStatus === 'live' ? 'Live GPS' : 'GPS Simulation'}
              </div>
            </div>

            <button
              type="button"
              onClick={requestRealGps}
              className="min-h-[40px] px-3 rounded-xl bg-white/95 border border-[#EAE4DC] text-xs font-semibold text-[#181E25] hover:bg-white inline-flex items-center gap-1.5 shadow-xs"
            >
              <Navigation className="w-3.5 h-3.5 text-[#EC6B3F]" />
              <span>Locate</span>
            </button>
          </div>

          {/* Bottom Interactive GPS Walk Helper for Desktop/Indoor Evaluation */}
          <div className="absolute bottom-4 left-4 right-4 z-10 rounded-2xl bg-white/95 border border-[#EAE4DC] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-[#181E25]">
              <Footprints className="w-4 h-4 text-[#EC6B3F] shrink-0" />
              <span className="font-semibold">Walk Toward Geofence (Indoor GPS Test)</span>
            </div>
            <div className="flex items-center gap-3 flex-1 max-w-xs">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={walkProgress}
                onChange={(e) => setWalkProgress(Number(e.target.value))}
                className="w-full accent-[#1D8348] cursor-pointer"
              />
              <span className="font-mono text-xs font-semibold text-[#181E25] tabular-nums w-12 text-right">
                {distanceMeters}m
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Geofence Telemetry & Hunt Action Card */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          {/* Dark Telemetry Panel matching screenshot */}
          <div className="rounded-3xl bg-[#181E25] text-white p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-3xl font-bold tabular-nums">
                  {hh}:{mm}:{ss}
                </div>
                <div className="text-xs text-white/65 mt-0.5">Elapsed Hunt Time</div>
              </div>

              <div
                className={`rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5 ${
                  insideZone
                    ? 'bg-[#1D8348]/25 text-[#86EFAC] border border-[#1D8348]/50'
                    : 'bg-white/10 text-white/80 border border-white/15'
                }`}
              >
                {insideZone ? (
                  <CheckCircle2 className="w-4 h-4 text-[#86EFAC]" />
                ) : (
                  <Compass className="w-4 h-4 text-[#EC6B3F]" />
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
                    className="h-full rounded-full bg-[#22C55E] transition-all"
                    style={{ width: `${Math.max(12, Math.round(walkProgress * 100))}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-white/70 pt-1 tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#EC6B3F]" />
                  {currentLat.toFixed(4)}, {currentLng.toFixed(4)}
                </span>
                <span>+{activeHunt.participantCount} runners</span>
              </div>
            </div>
          </div>

          {/* Active Hunt Pool Card */}
          <div className="rounded-3xl bg-white border border-[#EAE4DC] p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[#EC6B3F] inline-flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  <span>Actake Hunt · {activeHunt.alarmTimeLabel}</span>
                </div>
                <h2 className="font-display text-xl font-bold text-[#181E25] mt-1">
                  {activeHunt.title}
                </h2>
                <p className="text-xs text-[#5E6873] mt-1">
                  Requires geofence arrival + live camera proof ({activeHunt.targetItemHint}).
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-2xl font-extrabold text-[#181E25] tabular-nums">
                  ${activeHunt.poolUsd}
                </div>
                <div className="text-xs text-[#646F7C]">Pool</div>
              </div>
            </div>

            <button
              type="button"
              disabled={!insideZone}
              onClick={() => onLaunchGeoProof(activeHunt)}
              className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[#EC6B3F] hover:bg-[#D95B31] disabled:bg-[#E6DFD6] disabled:text-[#7A8491] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
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
