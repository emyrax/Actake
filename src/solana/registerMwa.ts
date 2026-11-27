import { registerMwa } from '@solana-mobile/wallet-standard-mobile';

let mwaRegistered = false;

/**
 * Registers Mobile Wallet Adapter (MWA) into the browser Wallet Standard registry.
 * Must run exclusively in the browser (non-SSR) at application startup.
 */
export function ensureMwaRegistered(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (mwaRegistered) {
    return true;
  }
  try {
    registerMwa({
      appIdentity: {
        name: 'Actake',
        uri: window.location.origin,
        icon: 'assets/aistudio/image-removebg-preview__1__38d6ac67.png',
      },
      chains: ['solana:devnet', 'solana:mainnet'],
    });
    mwaRegistered = true;
    return true;
  } catch (err) {
    console.warn('MWA registration skipped or already active:', err);
    return false;
  }
}
