import type { TrackProofPayload } from '../types';

export interface NativeStepProofResult {
  wallet: string;
  poolId: string;
  dayIndex: number;
  steps: number;
  sensorTimestamp: number;
  deviceBootCount: number;
  proofHash: string;
  sensorAvailable: boolean;
}

interface CapacitorStepBridgePlugin {
  startStepTracking: () => Promise<{
    tracking: boolean;
    dailySteps: number;
    deviceBootCount: number;
  }>;
  getDailyStepProof: (opts: {
    wallet: string;
    poolId: string;
    dayIndex: number;
  }) => Promise<NativeStepProofResult>;
  scheduleMidnightMonitor: (opts: {
    poolId: string;
    wallet: string;
    dayIndex: number;
    targetSteps: number;
    rpcEndpoint?: string;
  }) => Promise<{ scheduled: boolean; windowLocalTime: string }>;
  authorizeEphemeralSessionKey: (opts: {
    delegatePubkey: string;
    expiresAtMs: number;
  }) => Promise<{ authorized: boolean }>;
  revokeEphemeralSessionKey: () => Promise<{ revoked: boolean }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: {
    StepCounterBridge?: CapacitorStepBridgePlugin;
  };
}

function getNativeStepPlugin(): CapacitorStepBridgePlugin | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.Plugins?.StepCounterBridge) return null;
  return cap.Plugins.StepCounterBridge;
}

export function isNativeAndroidStepBridgeAvailable(): boolean {
  return getNativeStepPlugin() !== null;
}

export function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Starts the native Android hardware TYPE_STEP_COUNTER listener via Capacitor StepCounterBridge.
 * Strictly opt-in — never invoked automatically on page mount.
 */
export async function startNativeHardwareStepSensor(): Promise<{
  available: boolean;
  dailySteps: number;
  deviceBootCount: number;
  message: string;
}> {
  const plugin = getNativeStepPlugin();
  if (!plugin) {
    return {
      available: false,
      dailySteps: 0,
      deviceBootCount: 0,
      message:
        'Hardware step counter requires the Actake Android / Solana Seeker APK (Capacitor StepCounterBridge). Desktop browsers cannot access Android TYPE_STEP_COUNTER.',
    };
  }
  const res = await plugin.startStepTracking();
  return {
    available: true,
    dailySteps: Number(res.dailySteps) || 0,
    deviceBootCount: Number(res.deviceBootCount) || 1,
    message: 'Android hardware step sensor active (EncryptedSharedPreferences midnight baseline).',
  };
}

/**
 * Reads today's tamper-resistant step delta & SHA-256 proof_hash from the Capacitor Android bridge.
 */
export async function readNativeDailyStepProof(params: {
  wallet: string;
  poolId: string;
  dayIndex: number;
}): Promise<TrackProofPayload> {
  const plugin = getNativeStepPlugin();
  if (!plugin) {
    throw new Error(
      'Open this Steps pool in the Actake Android / Solana Seeker APK to generate a hardware-signed step proof.'
    );
  }
  const nativeProof = await plugin.getDailyStepProof(params);
  const canonicalJson = JSON.stringify({
    wallet: nativeProof.wallet,
    poolId: nativeProof.poolId,
    dayIndex: nativeProof.dayIndex,
    steps: nativeProof.steps,
    sensorTimestamp: nativeProof.sensorTimestamp,
    deviceBootCount: nativeProof.deviceBootCount,
  });

  return {
    track: 'steps',
    metricAchieved: nativeProof.steps,
    proofHash: nativeProof.proofHash,
    canonicalJson,
    sampleCount: 1,
    collectedAtIso: new Date().toISOString(),
  };
}

export async function scheduleNativeMidnightStepMonitor(params: {
  poolId: string;
  wallet: string;
  dayIndex: number;
  targetSteps: number;
}): Promise<boolean> {
  const plugin = getNativeStepPlugin();
  if (!plugin) return false;
  try {
    await plugin.scheduleMidnightMonitor({
      ...params,
      rpcEndpoint: 'https://api.devnet.solana.com',
    });
    return true;
  } catch {
    return false;
  }
}

export async function syncEphemeralSessionKeyToNative(params: {
  delegatePubkey: string;
  expiresAtMs: number;
}): Promise<boolean> {
  const plugin = getNativeStepPlugin();
  if (!plugin) return false;
  try {
    await plugin.authorizeEphemeralSessionKey(params);
    return true;
  } catch {
    return false;
  }
}
