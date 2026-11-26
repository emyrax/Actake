import { Buffer } from 'buffer';
import { createRoot } from 'react-dom/client';
import { ensureMwaRegistered } from './solana/registerMwa';
import { ActakePollarProvider } from './context/ActakePollarProvider';
import App from './App.tsx';
import './index.css';

// Polyfill Buffer for @solana/web3.js browser Transaction serialization
if (typeof globalThis !== 'undefined' && !(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

// Register Solana Mobile Wallet Adapter (MWA) at browser app root
ensureMwaRegistered();

createRoot(document.getElementById('root')!).render(
  <ActakePollarProvider>
    <App />
  </ActakePollarProvider>
);
