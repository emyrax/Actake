import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoCoordinate, LiveHunterPresence } from '../../types/geodrops';

export type PresenceConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

interface UseLiveHuntPresenceParams {
  huntId: string;
  walletPubkey: string;
  displayLabel?: string;
  userCoord: GeoCoordinate | null;
  /** Strictly opt-in: user must explicitly enable Share Live Location */
  shareLocation: boolean;
}

interface UseLiveHuntPresenceResult {
  rivals: LiveHunterPresence[];
  rivalsOnThisHunt: LiveHunterPresence[];
  connectionStatus: PresenceConnectionStatus;
}

const EMIT_THROTTLE_MS = 1_500;
const HEARTBEAT_INTERVAL_MS = 15_000;

function formatShortWalletLabel(wallet: string): string {
  const clean = wallet.trim();
  if (clean.length <= 10) return clean || 'Hunter';
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

/**
 * Real-time WebSocket presence hook for GeoDrops hunt competition.
 * - Hydrates immediately via REST snapshot + upgrades to /ws/hunts-presence
 * - Maintains an idempotent Map<hunterId, LiveHunterPresence>
 * - Only broadcasts the local user's location when `shareLocation` is explicitly enabled
 * - Auto-reconnects with exponential backoff and emits `hunter:leave` cleanly on opt-out/unmount
 */
export function useLiveHuntPresence({
  huntId,
  walletPubkey,
  displayLabel,
  userCoord,
  shareLocation,
}: UseLiveHuntPresenceParams): UseLiveHuntPresenceResult {
  const [huntersById, setHuntersById] = useState<Map<string, LiveHunterPresence>>(
    () => new Map()
  );
  const [connectionStatus, setConnectionStatus] =
    useState<PresenceConnectionStatus>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lastEmitAtRef = useRef(0);
  const wasSharingRef = useRef(false);

  // Keep latest values in refs so socket handlers never stale-close
  const latestRef = useRef({
    huntId,
    walletPubkey,
    displayLabel: displayLabel || formatShortWalletLabel(walletPubkey),
    userCoord,
    shareLocation,
  });
  latestRef.current = {
    huntId,
    walletPubkey,
    displayLabel: displayLabel || formatShortWalletLabel(walletPubkey),
    userCoord,
    shareLocation,
  };

  const sendPresenceUpdate = useCallback((force = false) => {
    const ws = wsRef.current;
    const { shareLocation: sharing, userCoord: coord, huntId: activeHuntId, walletPubkey: wallet, displayLabel: label } =
      latestRef.current;

    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!sharing || !coord || !activeHuntId) return;

    const now = Date.now();
    if (!force && now - lastEmitAtRef.current < EMIT_THROTTLE_MS) {
      return;
    }
    lastEmitAtRef.current = now;

    try {
      ws.send(
        JSON.stringify({
          type: 'hunter:update',
          hunterId: wallet,
          walletPubkey: wallet,
          displayLabel: label,
          huntId: activeHuntId,
          lat: coord.lat,
          lng: coord.lng,
        })
      );
    } catch {
      // Socket reconnect loop handles transient send errors
    }
  }, []);

  const sendPresenceLeave = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: 'hunter:leave' }));
    } catch {
      // Ignore closed socket
    }
  }, []);

  // Hydrate initial snapshot via REST + connect persistent WebSocket
  useEffect(() => {
    let disposed = false;

    const hydrateViaRest = async () => {
      try {
        const resp = await fetch('/api/hunts/presence');
        if (!resp.ok || disposed) return;
        const data = (await resp.json()) as { hunters?: LiveHunterPresence[] };
        if (!Array.isArray(data.hunters) || disposed) return;
        setHuntersById(() => {
          const next = new Map<string, LiveHunterPresence>();
          for (const h of data.hunters!) {
            next.set(h.hunterId, h);
          }
          return next;
        });
      } catch {
        // WebSocket snapshot handles hydration cleanly
      }
    };

    void hydrateViaRest();

    const connect = () => {
      if (disposed || typeof window === 'undefined') return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/hunts-presence`;

      setConnectionStatus(reconnectAttemptRef.current === 0 ? 'connecting' : 'reconnecting');

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        reconnectAttemptRef.current = 0;
        setConnectionStatus('connected');
        if (latestRef.current.shareLocation && latestRef.current.userCoord) {
          sendPresenceUpdate(true);
        }
      };

      ws.onmessage = (event) => {
        if (disposed || typeof event.data !== 'string') return;
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            hunters?: LiveHunterPresence[];
            hunter?: LiveHunterPresence;
            hunterId?: string;
          };

          if (msg.type === 'presence:snapshot' && Array.isArray(msg.hunters)) {
            setHuntersById(() => {
              const next = new Map<string, LiveHunterPresence>();
              for (const h of msg.hunters!) {
                next.set(h.hunterId, h);
              }
              return next;
            });
          } else if (msg.type === 'hunter:upsert' && msg.hunter?.hunterId) {
            const incoming = msg.hunter;
            setHuntersById((prev) => {
              const next = new Map(prev);
              next.set(incoming.hunterId, incoming);
              return next;
            });
          } else if (msg.type === 'hunter:removed' && msg.hunterId) {
            const removedId = msg.hunterId;
            setHuntersById((prev) => {
              if (!prev.has(removedId)) return prev;
              const next = new Map(prev);
              next.delete(removedId);
              return next;
            });
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (!disposed) {
          setConnectionStatus('reconnecting');
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // onclose handles backoff reconnect
      };
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      const attempt = reconnectAttemptRef.current;
      reconnectAttemptRef.current = Math.min(attempt + 1, 5);
      const delayMs = Math.min(15_000, 1_000 * Math.pow(2, attempt));
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delayMs);
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'hunter:leave' }));
          }
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, [sendPresenceUpdate]);

  // Emit updates when sharing is toggled on or coordinates change; emit leave immediately on opt-out
  useEffect(() => {
    if (shareLocation && userCoord) {
      const justTurnedOn = !wasSharingRef.current;
      wasSharingRef.current = true;
      sendPresenceUpdate(justTurnedOn);
    } else if (wasSharingRef.current) {
      wasSharingRef.current = false;
      sendPresenceLeave();
    }
  }, [shareLocation, userCoord?.lat, userCoord?.lng, huntId, sendPresenceUpdate, sendPresenceLeave]);

  // Keepalive heartbeat every 15s while sharing so stationary hunters don't time out on the 35s server TTL
  useEffect(() => {
    if (!shareLocation || !userCoord) return;
    const timer = window.setInterval(() => {
      sendPresenceUpdate(true);
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [shareLocation, Boolean(userCoord), sendPresenceUpdate]);

  const rivals = useMemo(() => {
    const list: LiveHunterPresence[] = [];
    for (const hunter of huntersById.values()) {
      if (hunter.hunterId === walletPubkey) continue;
      list.push(hunter);
    }
    return list.sort((a, b) => a.distanceToTargetMeters - b.distanceToTargetMeters);
  }, [huntersById, walletPubkey]);

  const rivalsOnThisHunt = useMemo(
    () => rivals.filter((h) => h.huntId === huntId),
    [rivals, huntId]
  );

  return {
    rivals,
    rivalsOnThisHunt,
    connectionStatus,
  };
}
