import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Radio, Users, X } from 'lucide-react';
import type {
  GeoCoordinate,
  HunterPresenceScope,
  LiveHunterPresence,
} from '../../types/geodrops';
import { formatDistanceLabel } from '../../hooks/hunts/geoMath';
import { useLiveHuntPresence } from '../../hooks/hunts/useLiveHuntPresence';

export interface CompetingHuntersLayerProps {
  /** Active Leaflet map instance where colored hunter dots and tooltips are rendered */
  map: L.Map | null;
  /** Currently selected hunt ID */
  huntId: string;
  /** Local hunter's wallet public key (excluded from rival dots) */
  walletPubkey: string;
  /** Optional custom short display name for the local hunter */
  displayLabel?: string;
  /** Local hunter's active GPS or Indoor Demo coordinate (null while sensors are paused) */
  userCoord: GeoCoordinate | null;
  /** Local hunter's live distance to the current hunt target in meters */
  userDistanceMeters?: number | null;
  /** Whether sensors/demo are active; turns off opt-in broadcasting when false */
  sensorsActive: boolean;
  /** Controlled open state for the collapsible Live Rivals sheet */
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  /** Called before opening the panel so sibling map popovers (Hints / Info) can collapse */
  onBeforeOpenPanel?: () => void;
  /** Called when tapping a rival row to ensure the map subview is visible */
  onFocusRivalMap?: () => void;
}

/**
 * Builds a safe DOM tooltip node using textContent (never raw HTML interpolation)
 * showing a competing hunter's unique color dot, label, live distance to target,
 * active hunt name, and competitive lead/lag comparison.
 */
function buildRivalTooltipElement(
  hunter: LiveHunterPresence,
  activeHuntId: string,
  userDistanceMeters?: number | null
): HTMLElement {
  const root = document.createElement('div');
  root.style.minWidth = '156px';
  root.style.maxWidth = '230px';
  root.style.fontFamily = 'inherit';
  root.style.lineHeight = '1.35';

  // Row 1: Unique color swatch + sanitized hunter label
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.gap = '6px';
  header.style.fontWeight = '700';
  header.style.fontSize = '12px';
  header.style.color = '#111114';

  const swatch = document.createElement('span');
  swatch.style.width = '9px';
  swatch.style.height = '9px';
  swatch.style.borderRadius = '9999px';
  swatch.style.backgroundColor = hunter.color;
  swatch.style.flexShrink = '0';
  swatch.style.boxShadow = '0 0 0 1.5px rgba(17,17,20,0.18)';

  const nameSpan = document.createElement('span');
  nameSpan.textContent = hunter.displayLabel;
  nameSpan.style.overflow = 'hidden';
  nameSpan.style.textOverflow = 'ellipsis';
  nameSpan.style.whiteSpace = 'nowrap';

  header.appendChild(swatch);
  header.appendChild(nameSpan);
  root.appendChild(header);

  // Row 2: Live distance to target (tabular numerals)
  const distRow = document.createElement('div');
  distRow.style.marginTop = '3px';
  distRow.style.fontSize = '12px';
  distRow.style.fontWeight = '700';
  distRow.style.fontVariantNumeric = 'tabular-nums';
  distRow.style.color = hunter.insideGeofence ? '#15803D' : '#111114';
  distRow.textContent = hunter.insideGeofence
    ? `Inside unlock zone (${formatDistanceLabel(hunter.distanceToTargetMeters)})`
    : `${formatDistanceLabel(hunter.distanceToTargetMeters)} to target`;
  root.appendChild(distRow);

  // Row 3: Active hunt title
  const huntRow = document.createElement('div');
  huntRow.style.marginTop = '2px';
  huntRow.style.fontSize = '11px';
  huntRow.style.color = '#52504E';
  huntRow.style.whiteSpace = 'normal';
  huntRow.textContent = `Hunt: ${hunter.huntTitle}`;
  root.appendChild(huntRow);

  // Row 4: Competitive lead/lag cue when chasing the same hunt
  if (
    hunter.huntId === activeHuntId &&
    typeof userDistanceMeters === 'number' &&
    Number.isFinite(userDistanceMeters)
  ) {
    const delta = Math.round(userDistanceMeters - hunter.distanceToTargetMeters);
    const raceRow = document.createElement('div');
    raceRow.style.marginTop = '3px';
    raceRow.style.fontSize = '11px';
    raceRow.style.fontWeight = '700';
    raceRow.style.fontVariantNumeric = 'tabular-nums';

    if (delta > 5) {
      raceRow.style.color = '#C2410C';
      raceRow.textContent = `${formatDistanceLabel(delta)} ahead of you — move fast`;
    } else if (delta < -5) {
      raceRow.style.color = '#15803D';
      raceRow.textContent = `${formatDistanceLabel(Math.abs(delta))} behind you`;
    } else {
      raceRow.style.color = '#7C3AED';
      raceRow.textContent = 'Neck and neck with you';
    }
    root.appendChild(raceRow);
  }

  return root;
}

/**
 * Self-contained real-time WebSocket competing hunters layer & HUD controls:
 * - Subscribes to /ws/hunts-presence via `useLiveHuntPresence`
 * - Renders other active hunters onto the Leaflet map as unique colored dots with hover/tap distance & hunt tooltips
 * - Provides the This Hunt / All Hunts scope toggle and opt-in ~20m fuzzed location sharing switch
 */
export const CompetingHuntersLayer: React.FC<CompetingHuntersLayerProps> = ({
  map,
  huntId,
  walletPubkey,
  displayLabel,
  userCoord,
  userDistanceMeters = null,
  sensorsActive,
  panelOpen,
  onPanelOpenChange,
  onBeforeOpenPanel,
  onFocusRivalMap,
}) => {
  // Strictly opt-in: location sharing starts OFF by default
  const [shareLiveLocation, setShareLiveLocation] = useState(false);
  const [presenceScope, setPresenceScope] = useState<HunterPresenceScope>('this-hunt');

  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const markersByIdRef = useRef<Map<string, L.CircleMarker>>(new Map());

  // Automatically disable location broadcasting if user pauses GPS/demo sensors
  useEffect(() => {
    if (!sensorsActive && shareLiveLocation) {
      setShareLiveLocation(false);
    }
  }, [sensorsActive, shareLiveLocation]);

  const { rivals, rivalsOnThisHunt, connectionStatus } = useLiveHuntPresence({
    huntId,
    walletPubkey,
    displayLabel,
    userCoord,
    shareLocation: shareLiveLocation,
  });

  const visibleRivals = presenceScope === 'this-hunt' ? rivalsOnThisHunt : rivals;
  const closestRivalOnHunt = rivalsOnThisHunt[0] ?? null;

  // Create and tear down a dedicated Leaflet LayerGroup whenever the map instance mounts/unmounts
  useEffect(() => {
    if (!map) {
      layerGroupRef.current = null;
      markersByIdRef.current.clear();
      return;
    }

    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;

    return () => {
      markersByIdRef.current.clear();
      group.clearLayers();
      group.remove();
      if (layerGroupRef.current === group) {
        layerGroupRef.current = null;
      }
    };
  }, [map]);

  // Render active rival hunter dots and safe hover/tap tooltips onto the dedicated layer
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;

    group.clearLayers();
    markersByIdRef.current.clear();

    for (const hunter of visibleRivals) {
      const isClosingIn = hunter.distanceToTargetMeters <= 150 || hunter.insideGeofence;

      if (isClosingIn) {
        L.circleMarker([hunter.lat, hunter.lng], {
          radius: 15,
          color: hunter.color,
          weight: 1.5,
          opacity: 0.65,
          fillColor: hunter.color,
          fillOpacity: 0.2,
          interactive: false,
        }).addTo(group);
      }

      const tooltipNode = buildRivalTooltipElement(hunter, huntId, userDistanceMeters);

      const dotMarker = L.circleMarker([hunter.lat, hunter.lng], {
        radius: 8.5,
        color: '#FFFFFF',
        weight: 3,
        fillColor: hunter.color,
        fillOpacity: 1,
        interactive: true,
      })
        .bindTooltip(tooltipNode, {
          direction: 'top',
          offset: [0, -10],
          opacity: 0.98,
          sticky: false,
        })
        .addTo(group);

      // Touch-screen support: tapping a dot opens/toggles its distance & hunt tooltip
      dotMarker.on('click', () => {
        if (dotMarker.isTooltipOpen()) {
          dotMarker.closeTooltip();
        } else {
          dotMarker.openTooltip();
        }
      });

      markersByIdRef.current.set(hunter.hunterId, dotMarker);
    }
  }, [map, visibleRivals, huntId, userDistanceMeters]);

  const handleFocusRival = (rival: LiveHunterPresence) => {
    onFocusRivalMap?.();
    onPanelOpenChange(false);

    if (map) {
      map.flyTo([rival.lat, rival.lng], Math.max(map.getZoom(), 17), {
        duration: 0.55,
      });
      const marker = markersByIdRef.current.get(rival.hunterId);
      if (marker) {
        window.setTimeout(() => {
          marker.openTooltip();
        }, 320);
      }
    }
  };

  return (
    <>
      {/* Collapsible Live Competing Hunters Sheet (collapsed by default) */}
      {panelOpen && (
        <div className="fixed right-3 left-3 sm:left-auto bottom-[152px] sm:bottom-[160px] sm:w-[356px] max-h-[52vh] z-[60] rounded-[22px] bg-[#141519]/96 border border-white/15 text-white p-4 shadow-2xl flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#F4976C] shrink-0" />
                <span className="text-xs font-bold tracking-tight">Live Competing Hunters</span>
              </div>
              <div className="text-[11px] text-white/60 mt-0.5 tabular-nums">
                {connectionStatus === 'connected'
                  ? `${visibleRivals.length} active · hover or tap any dot`
                  : 'Syncing live presence...'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onPanelOpenChange(false)}
              aria-label="Close live hunters panel"
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scope Toggle: This Hunt vs All Hunts */}
          <div
            role="tablist"
            aria-label="Competing hunters scope"
            className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/8 shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={presenceScope === 'this-hunt'}
              onClick={() => setPresenceScope('this-hunt')}
              className={`min-h-[38px] px-2.5 rounded-lg text-xs font-bold tabular-nums whitespace-nowrap transition-colors ${
                presenceScope === 'this-hunt'
                  ? 'bg-white text-[#111114]'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              This Hunt ({rivalsOnThisHunt.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={presenceScope === 'all-hunts'}
              onClick={() => setPresenceScope('all-hunts')}
              className={`min-h-[38px] px-2.5 rounded-lg text-xs font-bold tabular-nums whitespace-nowrap transition-colors ${
                presenceScope === 'all-hunts'
                  ? 'bg-white text-[#111114]'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              All Hunts ({rivals.length})
            </button>
          </div>

          {/* Opt-In Privacy Location Share Toggle (~20m server safety fuzz) */}
          <div className="rounded-2xl bg-white/6 border border-white/10 px-3 py-2.5 flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">Share Live Location</div>
              <div className="text-[11px] text-white/65 leading-snug mt-0.5">
                {shareLiveLocation
                  ? userCoord
                    ? 'Visible to rivals with ~20m safety fuzz.'
                    : 'Turn on Live GPS or Demo below to broadcast.'
                  : 'Off by default · shifted ~20m when shared.'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shareLiveLocation}
              aria-label="Toggle live location sharing with 20m safety fuzz"
              onClick={() => setShareLiveLocation((v) => !v)}
              className={`min-w-[60px] min-h-[38px] px-3 rounded-full text-xs font-bold transition-colors shrink-0 ${
                shareLiveLocation
                  ? 'bg-[#16A34A] text-white hover:bg-[#15803D]'
                  : 'bg-white/14 text-white/85 hover:bg-white/22'
              }`}
            >
              {shareLiveLocation ? 'On' : 'Off'}
            </button>
          </div>

          {/* Ranked Live Competing Hunters List */}
          <div className="overflow-y-auto space-y-1.5 pr-0.5 min-h-[72px]">
            {visibleRivals.length === 0 ? (
              <div className="rounded-2xl bg-white/5 px-3.5 py-4 text-center space-y-1">
                <div className="text-xs font-semibold text-white/85">
                  {presenceScope === 'this-hunt'
                    ? 'No rivals sharing location on this hunt yet'
                    : 'No other hunters sharing live location right now'}
                </div>
                <p className="text-[11px] text-white/55 leading-relaxed">
                  Other opted-in hunters appear here and as unique colored dots on the map in real
                  time.
                </p>
              </div>
            ) : (
              visibleRivals.map((rival) => {
                const sameHunt = rival.huntId === huntId;
                const delta =
                  sameHunt && typeof userDistanceMeters === 'number'
                    ? Math.round(userDistanceMeters - rival.distanceToTargetMeters)
                    : null;

                return (
                  <button
                    key={rival.hunterId}
                    type="button"
                    onClick={() => handleFocusRival(rival)}
                    className="w-full min-h-[54px] px-3 py-2 rounded-2xl bg-white/6 hover:bg-white/12 border border-white/8 flex items-center justify-between gap-2.5 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full border-2 border-white shrink-0"
                        style={{ backgroundColor: rival.color }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {rival.displayLabel}
                        </div>
                        <div className="text-[11px] text-white/60 truncate">
                          {rival.huntTitle}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono tabular-nums">
                      <div
                        className={`text-xs font-bold ${
                          rival.insideGeofence ? 'text-[#4ADE80]' : 'text-white'
                        }`}
                      >
                        {rival.insideGeofence
                          ? 'In Zone'
                          : formatDistanceLabel(rival.distanceToTargetMeters)}
                      </div>
                      {delta !== null && (
                        <div
                          className={`text-[10px] font-semibold ${
                            delta > 5
                              ? 'text-[#F4976C]'
                              : delta < -5
                                ? 'text-[#4ADE80]'
                                : 'text-white/65'
                          }`}
                        >
                          {delta > 5
                            ? `${formatDistanceLabel(delta)} ahead`
                            : delta < -5
                              ? `${formatDistanceLabel(Math.abs(delta))} behind`
                              : 'Even'}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Floating Right-Side Live Rivals Trigger Button */}
      <button
        type="button"
        onClick={() => {
          if (!panelOpen) onBeforeOpenPanel?.();
          onPanelOpenChange(!panelOpen);
        }}
        title={
          closestRivalOnHunt
            ? `Live Hunters · Closest rival ${formatDistanceLabel(closestRivalOnHunt.distanceToTargetMeters)} from target`
            : 'Track live competing hunters on the map'
        }
        aria-label="Open live competing hunters panel"
        aria-expanded={panelOpen}
        className={`min-h-[48px] min-w-[48px] px-3 rounded-full border-2 flex items-center justify-center gap-1.5 shadow-xl active:scale-95 transition-all ${
          panelOpen
            ? 'bg-[#F16A2E] border-[#FDE68A] text-white'
            : shareLiveLocation
              ? 'bg-[#141519]/95 border-[#4ADE80] text-white hover:bg-[#1E2028]'
              : 'bg-[#141519]/95 border-white/25 text-white hover:bg-[#1E2028]'
        }`}
      >
        {shareLiveLocation ? (
          <Radio className="w-4 h-4 text-[#4ADE80] shrink-0" />
        ) : (
          <Users className="w-4 h-4 text-[#F4976C] shrink-0" />
        )}
        <span className="font-mono text-xs font-extrabold tabular-nums">
          {visibleRivals.length}
        </span>
      </button>
    </>
  );
};
