import { useEffect, useState } from 'react';

export type ArSessionMode = 'idle' | 'webxr-ready' | 'camera-passthrough' | 'spatial-backdrop';

export interface ArSessionState {
  mode: ArSessionMode;
  webxrSupported: boolean;
  cameraStream: MediaStream | null;
  cameraError: string | null;
  initializing: boolean;
}

interface UseArSessionParams {
  /** Primary opt-in hardware gate shared with useHighAccuracyGPS & useCompassHeading */
  isSensorActive: boolean;
  /** Optional sub-gate (e.g. only open rear camera when user opens AR Camera viewfinder) */
  isCameraActive?: boolean;
  /** When true, skips real rear camera prompt and renders the spatial studio backdrop */
  preferSpatialBackdrop?: boolean;
}

/**
 * Strictly opt-in AR session hook.
 * NEVER triggers WebXR or camera permissions unless `isSensorActive === true`
 * (and `isCameraActive !== false`).
 * Checks `navigator.xr?.isSessionSupported('immersive-ar')` (WebXR ARCore on Seeker/Android)
 * and falls back cleanly to a live rear-camera `<video>` passthrough (`facingMode: 'environment'`)
 * or spatial AR studio backdrop when camera access is unavailable.
 */
export function useARSession({
  isSensorActive,
  isCameraActive = true,
  preferSpatialBackdrop = false,
}: UseArSessionParams): ArSessionState {
  const [webxrSupported, setWebxrSupported] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [mode, setMode] = useState<ArSessionMode>('idle');

  const active = isSensorActive && isCameraActive;

  useEffect(() => {
    if (!active) {
      setMode('idle');
      setCameraError(null);
      setInitializing(false);
      setCameraStream((prev) => {
        if (prev) {
          prev.getTracks().forEach((t) => t.stop());
        }
        return null;
      });
      return;
    }

    let cancelled = false;
    let activeStream: MediaStream | null = null;

    const startAr = async () => {
      setInitializing(true);
      setCameraError(null);

      // 1. Probe WebXR ARCore support (Solana Seeker / Android Chrome)
      try {
        const navXr = (
          navigator as Navigator & {
            xr?: { isSessionSupported?: (mode: string) => Promise<boolean> };
          }
        ).xr;
        if (navXr?.isSessionSupported) {
          const supported = await navXr.isSessionSupported('immersive-ar');
          if (!cancelled) {
            setWebxrSupported(Boolean(supported));
          }
        }
      } catch {
        if (!cancelled) setWebxrSupported(false);
      }

      if (preferSpatialBackdrop) {
        if (!cancelled) {
          setMode('spatial-backdrop');
          setInitializing(false);
        }
        return;
      }

      // 2. Open live rear-camera video passthrough behind transparent Three.js canvas
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setCameraError('Live camera unavailable in this browser — using spatial AR backdrop.');
          setMode('spatial-backdrop');
          setInitializing(false);
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        activeStream = stream;
        setCameraStream(stream);
        setMode('camera-passthrough');
        setInitializing(false);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error && /NotAllowedError|Permission/i.test(err.name || err.message)
            ? 'Camera access declined — rendering 3D AR asset over spatial studio backdrop.'
            : 'Rear camera unavailable on this device — rendering 3D AR asset over spatial backdrop.';
        setCameraError(msg);
        setMode('spatial-backdrop');
        setInitializing(false);
      }
    };

    void startAr();

    return () => {
      cancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
      setCameraStream((prev) => {
        if (prev && prev !== activeStream) {
          prev.getTracks().forEach((t) => t.stop());
        }
        return null;
      });
    };
  }, [active, preferSpatialBackdrop]);

  return {
    mode,
    webxrSupported,
    cameraStream,
    cameraError,
    initializing,
  };
}
