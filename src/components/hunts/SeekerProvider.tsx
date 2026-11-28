import React, { useEffect } from 'react';
import { registerSeekerConnect } from '@solana-mobile/seeker-connect-wallet-standard';

let seekerRegisteredOnce = false;

interface SeekerProviderProps {
  children: React.ReactNode;
}

/**
 * Isolated client-only Seeker Connect Wallet Standard augmentation wrapper.
 * Conditionally registers Seeker Connect inside a browser effect so Solana Seeker
 * devices get seamless one-tap Seed Vault signing without disturbing desktop wallets
 * or modifying Actake's global wallet provider.
 */
export const SeekerProvider: React.FC<SeekerProviderProps> = ({ children }) => {
  useEffect(() => {
    if (typeof window === 'undefined' || seekerRegisteredOnce) return;

    const ua = navigator.userAgent || '';
    const isAndroidOrSeeker = /Android|Seeker|SolanaMobile/i.test(ua);
    const configuredRelay =
      typeof import.meta !== 'undefined' && import.meta.env
        ? String(import.meta.env.VITE_SEEKER_RELAY_DOMAIN || '').trim()
        : '';

    // Register conditionally on Android/Seeker or whenever an explicit relay domain is configured
    if (!isAndroidOrSeeker && !configuredRelay) {
      return;
    }

    try {
      seekerRegisteredOnce = true;
      registerSeekerConnect({
        identity: {
          name: 'Actake GeoDrops',
          uri: window.location.origin,
          icon: '/favicon.ico',
        },
        relayDomain: configuredRelay || 'relay.solanamobile.com',
        chain: 'solana:devnet',
      });
    } catch {
      // Never block desktop or non-Seeker browsers if Wallet Standard augmentation is unavailable
    }
  }, []);

  return <>{children}</>;
};
