import type { TrackProofPayload } from '../types';

export interface StudyHeartbeatSample {
  seq: number;
  elapsedSeconds: number;
  visible: boolean;
  timestampMs: number;
}

export interface StudyTrackerState {
  active: boolean;
  pausedByTabSwitch: boolean;
  elapsedSeconds: number;
  focusedMinutes: number;
  interruptions: number;
  heartbeats: StudyHeartbeatSample[];
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hashes uninterrupted study session Web Worker heartbeats into a deterministic 32-byte SHA-256 proof_hash.
 */
export async function buildStudyFocusProof(params: {
  wallet: string;
  poolId: string;
  dayIndex: number;
  focusedMinutes: number;
  interruptions: number;
  heartbeats: StudyHeartbeatSample[];
}): Promise<TrackProofPayload> {
  const canonicalJson = JSON.stringify({
    track: 'study',
    wallet: params.wallet,
    poolId: params.poolId,
    dayIndex: params.dayIndex,
    focusedMinutes: params.focusedMinutes,
    interruptions: params.interruptions,
    heartbeats: params.heartbeats.slice(-180),
  });
  const proofHash = await sha256Hex(canonicalJson);
  return {
    track: 'study',
    metricAchieved: params.focusedMinutes,
    proofHash,
    canonicalJson,
    sampleCount: params.heartbeats.length,
    collectedAtIso: new Date().toISOString(),
  };
}

/**
 * Starts an uninterrupted study focus timer backed by an inline Web Worker (immune to main-thread
 * background timer throttling) combined with `document.visibilitychange` anti-tab-switch enforcement.
 * Switching away from the tab immediately pauses focus accumulation and records an interruption.
 */
export function startStudyFocusSession(params: {
  onUpdate: (state: StudyTrackerState) => void;
}): () => void {
  let elapsedSeconds = 0;
  let interruptions = 0;
  let pausedByTabSwitch = typeof document !== 'undefined' ? document.visibilityState !== 'visible' : false;
  let heartbeats: StudyHeartbeatSample[] = [];
  let seq = 0;
  let stopped = false;

  const emit = () => {
    if (stopped) return;
    params.onUpdate({
      active: !stopped,
      pausedByTabSwitch,
      elapsedSeconds,
      focusedMinutes: Math.floor(elapsedSeconds / 60),
      interruptions,
      heartbeats: [...heartbeats],
    });
  };

  const handleTick = () => {
    if (stopped) return;
    const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
    if (!isVisible) {
      pausedByTabSwitch = true;
      emit();
      return;
    }

    pausedByTabSwitch = false;
    elapsedSeconds += 1;

    // Record cryptographic heartbeat every 15 seconds (and on tick 1)
    if (elapsedSeconds === 1 || elapsedSeconds % 15 === 0) {
      seq += 1;
      heartbeats = [
        ...heartbeats.slice(-179),
        {
          seq,
          elapsedSeconds,
          visible: true,
          timestampMs: Date.now(),
        },
      ];
    }
    emit();
  };

  const handleVisibilityChange = () => {
    if (stopped) return;
    if (document.visibilityState !== 'visible') {
      pausedByTabSwitch = true;
      interruptions += 1;
    } else {
      pausedByTabSwitch = false;
    }
    emit();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  let worker: Worker | null = null;
  let workerBlobUrl: string | null = null;
  let fallbackIntervalId: number | null = null;

  try {
    const workerSource = `
      const id = setInterval(() => { postMessage('tick'); }, 1000);
      onmessage = (e) => { if (e.data === 'stop') { clearInterval(id); close(); } };
    `;
    const blob = new Blob([workerSource], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
    worker = new Worker(workerBlobUrl);
    worker.onmessage = () => handleTick();
  } catch {
    fallbackIntervalId = window.setInterval(handleTick, 1000);
  }

  emit();

  return () => {
    stopped = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (worker) {
      worker.postMessage('stop');
      worker.terminate();
    }
    if (workerBlobUrl) {
      URL.revokeObjectURL(workerBlobUrl);
    }
    if (fallbackIntervalId !== null) {
      window.clearInterval(fallbackIntervalId);
    }
  };
}
