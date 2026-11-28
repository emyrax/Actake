import type http from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { getGeoHuntById } from './geoDropsStore.ts';
import { isPointInsidePolygon } from '../hooks/hunts/geoMath.ts';
import type { LiveHunterPresence } from '../types/geodrops.ts';

const PRESENCE_WS_PATH = '/ws/hunts-presence';
const STALE_TTL_MS = 35_000;
const SWEEP_INTERVAL_MS = 10_000;
const MIN_UPDATE_INTERVAL_MS = 600;
const MAX_CLIENTS = 500;

/**
 * Curated 10-hue daylight-legible rival color palette.
 * Deliberately avoids Actake Orange (#F16A2E target pin) and Royal Blue (#2563EB "You" marker).
 */
const RIVAL_DOT_PALETTE = [
  '#9333EA', // Violet
  '#DB2777', // Magenta
  '#0D9488', // Teal
  '#D97706', // Amber Gold
  '#DC2626', // Crimson
  '#4F46E5', // Indigo
  '#059669', // Deep Emerald
  '#E11D48', // Rose
  '#0284C7', // Cerulean
  '#7C3AED', // Electric Purple
] as const;

interface StoredHunterSession {
  hunterId: string;
  socket: WebSocket;
  fuzzAngleRad: number;
  fuzzDistanceMeters: number;
  lastUpdateReceivedAt: number;
  presence: LiveHunterPresence | null;
}

const activeSessionsBySocket = new Map<WebSocket, StoredHunterSession>();
const activeHuntersById = new Map<string, LiveHunterPresence>();
let wssInstance: WebSocketServer | null = null;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function haversineMetersServer(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
}

/**
 * Applies a deterministic per-session 15–25m safety offset so other hunters never see
 * an individual's exact street-level coordinate, while keeping their dot smooth as they walk.
 */
function applyServerPrivacyFuzz(
  lat: number,
  lng: number,
  distanceMeters: number,
  angleRad: number
): { lat: number; lng: number } {
  const earthRadius = 6_371_000;
  const dLat = (distanceMeters * Math.cos(angleRad)) / earthRadius;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLng = (distanceMeters * Math.sin(angleRad)) / (earthRadius * cosLat);
  const fuzzedLat = Math.max(-89.9999, Math.min(89.9999, lat + (dLat * 180) / Math.PI));
  const fuzzedLng = Math.max(-179.9999, Math.min(179.9999, lng + (dLng * 180) / Math.PI));
  return {
    lat: Number(fuzzedLat.toFixed(6)),
    lng: Number(fuzzedLng.toFixed(6)),
  };
}

function pickDeterministicRivalColor(hunterId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < hunterId.length; i++) {
    hash ^= hunterId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash) % RIVAL_DOT_PALETTE.length;
  return RIVAL_DOT_PALETTE[index];
}

function sanitizeDisplayLabel(rawLabel: unknown, fallbackId: string): string {
  const cleaned = String(rawLabel ?? '')
    .replace(/[<>&"'`\r\n\t]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  if (cleaned.length >= 2) return cleaned;
  if (fallbackId.length > 10) {
    return `${fallbackId.slice(0, 4)}…${fallbackId.slice(-4)}`;
  }
  return fallbackId || 'Hunter';
}

function sanitizeHunterId(rawId: unknown, fallbackSessionId: string): string {
  const cleaned = String(rawId ?? '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .trim()
    .slice(0, 64);
  return cleaned.length >= 6 ? cleaned : fallbackSessionId;
}

function broadcastJson(payload: Record<string, unknown>): void {
  if (!wssInstance) return;
  const serialized = JSON.stringify(payload);
  for (const client of wssInstance.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(serialized);
      } catch {
        // Ignore broken sockets; close handler cleans them up
      }
    }
  }
}

export function getLiveHuntersSnapshot(huntId?: string): LiveHunterPresence[] {
  const now = Date.now();
  const list: LiveHunterPresence[] = [];
  for (const [id, hunter] of activeHuntersById.entries()) {
    if (now - hunter.updatedAt > STALE_TTL_MS) {
      activeHuntersById.delete(id);
      continue;
    }
    if (!huntId || hunter.huntId === huntId) {
      list.push(hunter);
    }
  }
  return list.sort((a, b) => a.distanceToTargetMeters - b.distanceToTargetMeters);
}

function removeSessionPresence(session: StoredHunterSession): void {
  if (session.presence) {
    const idToRemove = session.presence.hunterId;
    session.presence = null;
    if (activeHuntersById.delete(idToRemove)) {
      broadcastJson({
        type: 'hunter:removed',
        hunterId: idToRemove,
      });
    }
  }
}

function ensureStaleSweepRunning(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [hunterId, hunter] of activeHuntersById.entries()) {
      if (now - hunter.updatedAt > STALE_TTL_MS) {
        activeHuntersById.delete(hunterId);
        broadcastJson({
          type: 'hunter:removed',
          hunterId,
        });
      }
    }
  }, SWEEP_INTERVAL_MS);
  if (typeof sweepTimer.unref === 'function') {
    sweepTimer.unref();
  }
}

async function handleSocketMessage(
  session: StoredHunterSession,
  rawText: string
): Promise<void> {
  let msg: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') return;
    msg = parsed as Record<string, unknown>;
  } catch {
    return;
  }

  const eventType = String(msg.type || '');

  if (eventType === 'hunter:leave') {
    removeSessionPresence(session);
    return;
  }

  if (eventType === 'presence:sync') {
    if (session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(
        JSON.stringify({
          type: 'presence:snapshot',
          hunters: getLiveHuntersSnapshot(),
          serverTime: Date.now(),
        })
      );
    }
    return;
  }

  if (eventType !== 'hunter:update') {
    return;
  }

  const now = Date.now();
  if (now - session.lastUpdateReceivedAt < MIN_UPDATE_INTERVAL_MS) {
    return;
  }
  session.lastUpdateReceivedAt = now;

  const rawLat = Number(msg.lat);
  const rawLng = Number(msg.lng);
  if (
    !Number.isFinite(rawLat) ||
    !Number.isFinite(rawLng) ||
    rawLat < -90 ||
    rawLat > 90 ||
    rawLng < -180 ||
    rawLng > 180
  ) {
    return;
  }

  const huntId = String(msg.huntId ?? '').trim().slice(0, 80);
  if (!huntId) return;

  const hunt = await getGeoHuntById(huntId);
  if (!hunt) return;

  const nextHunterId = sanitizeHunterId(msg.hunterId ?? msg.walletPubkey, session.hunterId);
  if (session.presence && session.presence.hunterId !== nextHunterId) {
    removeSessionPresence(session);
  }
  session.hunterId = nextHunterId;

  const displayLabel = sanitizeDisplayLabel(msg.displayLabel, nextHunterId);
  const exactDistanceMeters = haversineMetersServer(rawLat, rawLng, hunt.targetLat, hunt.targetLng);
  const insidePoly =
    hunt.geofencePolygon && hunt.geofencePolygon.length >= 3
      ? isPointInsidePolygon(rawLat, rawLng, hunt.geofencePolygon)
      : false;
  const insideGeofence = exactDistanceMeters <= hunt.radiusMeters || insidePoly;

  // Server-side 20m safety fuzz: raw GPS is never broadcast to other hunters
  const fuzzed = applyServerPrivacyFuzz(
    rawLat,
    rawLng,
    session.fuzzDistanceMeters,
    session.fuzzAngleRad
  );

  const presence: LiveHunterPresence = {
    hunterId: nextHunterId,
    displayLabel,
    color: pickDeterministicRivalColor(nextHunterId),
    huntId: hunt.id,
    huntTitle: hunt.title,
    lat: fuzzed.lat,
    lng: fuzzed.lng,
    distanceToTargetMeters: Math.max(0, Math.round(exactDistanceMeters)),
    insideGeofence,
    updatedAt: now,
  };

  session.presence = presence;
  activeHuntersById.set(nextHunterId, presence);

  broadcastJson({
    type: 'hunter:upsert',
    hunter: presence,
  });
}

export function attachHuntPresenceWebSocket(server: http.Server): WebSocketServer {
  if (wssInstance) return wssInstance;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
  });
  wssInstance = wss;
  ensureStaleSweepRunning();

  server.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url || '/', 'http://localhost');
      if (reqUrl.pathname !== PRESENCE_WS_PATH) {
        return;
      }

      if (wss.clients.size >= MAX_CLIENTS) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    const fallbackId = `hunter_${crypto.randomBytes(5).toString('hex')}`;
    const angleRad = (crypto.randomInt(0, 3600) / 3600) * Math.PI * 2;
    const fuzzDistanceMeters = 15 + crypto.randomInt(0, 11); // 15m to 25m (~20m safety fuzz)

    const session: StoredHunterSession = {
      hunterId: fallbackId,
      socket: ws,
      fuzzAngleRad: angleRad,
      fuzzDistanceMeters,
      lastUpdateReceivedAt: 0,
      presence: null,
    };
    activeSessionsBySocket.set(ws, session);

    // Send immediate authoritative snapshot on connect
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'presence:snapshot',
          hunters: getLiveHuntersSnapshot(),
          serverTime: Date.now(),
        })
      );
    }

    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      void handleSocketMessage(session, text);
    });

    ws.on('close', () => {
      activeSessionsBySocket.delete(ws);
      removeSessionPresence(session);
    });

    ws.on('error', () => {
      activeSessionsBySocket.delete(ws);
      removeSessionPresence(session);
    });
  });

  return wss;
}
