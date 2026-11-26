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
        icon: 'assets/aistudio/Gemini_Generated_Image_eh2x1teh2x1teh2x_c3446dad.jpg',
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
