import { useCallback, useEffect, useState } from 'react';
import { computeRelativeBearingDelta, relativeDeltaToCue } from './geoMath';

interface WebkitDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

interface DeviceOrientationEventConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export interface CompassHeadingState {
  heading: number | null;
  relativeBearing: number;
  turnCue: string;
  supported: boolean;
  needsPermissionPrompt: boolean;
  requestCompassPermission: () => Promise<boolean>;
}

interface UseCompassHeadingParams {
  isSensorActive: boolean;
  targetBearing: number | null;
}

/**
 * Strictly opt-in device magnetometer/compass heading hook.
 * Listens to `deviceorientationabsolute` (Android Chrome / Solana Seeker)
 * with graceful fallback to `webkitCompassHeading` (iOS Safari) and `deviceorientation`.
 */
export function useCompassHeading({
  isSensorActive,
  targetBearing,
}: UseCompassHeadingParams): CompassHeadingState {
  const [heading, setHeading] = useState<number | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);

  const needsPermissionPrompt =
    typeof window !== 'undefined' &&
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as unknown as DeviceOrientationEventConstructorWithPermission)
      .requestPermission === 'function' &&
    !permissionGranted;

  const requestCompassPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      return false;
    }
    const ctor = DeviceOrientationEvent as unknown as DeviceOrientationEventConstructorWithPermission;
    if (typeof ctor.requestPermission !== 'function') {
      setPermissionGranted(true);
      return true;
    }
    try {
      const result = await ctor.requestPermission();
      const ok = result === 'granted';
      setPermissionGranted(ok);
      return ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isSensorActive || typeof window === 'undefined') {
      return;
    }

    const handleOrientation = (event: Event) => {
      const e = event as WebkitDeviceOrientationEvent;
      let nextHeading: number | null = null;

      if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
        nextHeading = ((e.webkitCompassHeading % 360) + 360) % 360;
      } else if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
        // On Android Chrome / Seeker, deviceorientationabsolute alpha increases counter-clockwise from North
        nextHeading = ((360 - e.alpha) % 360 + 360) % 360;
      }

      if (nextHeading !== null) {
        setSupported(true);
        setHeading(nextHeading);
      }
    };

    const hasAbsolute = 'ondeviceorientationabsolute' in window;
    if (hasAbsolute) {
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    }
    window.addEventListener('deviceorientation', handleOrientation, true);

    return () => {
      if (hasAbsolute) {
        window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      }
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [isSensorActive, permissionGranted]);

  const effectiveTarget = targetBearing ?? 0;
  const effectiveHeading = heading ?? 0;
  const relativeBearing = computeRelativeBearingDelta(effectiveTarget, effectiveHeading);
  const turnCue = relativeDeltaToCue(relativeBearing);

  return {
    heading,
    relativeBearing,
    turnCue,
    supported,
    needsPermissionPrompt,
    requestCompassPermission,
  };
}
