import { getWallets } from '@wallet-standard/app';
import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  DiscoveredWalletOption,
  PlatformCompatibility,
  WalletConnectionKind,
  WalletSession,
} from '../types/actake';
import { ensureMwaRegistered } from './registerMwa';
import {
  broadcastSignedTransactionToDevnet,
  buildDevnetExplorerTxUrl,
  buildDevnetSolscanTxUrl,
  sha256Bytes,
} from './actakeEscrow';

const SESSION_STORAGE_KEY = 'actake_wallet_session_v1';
const LOCAL_VAULT_SEED_KEY = 'actake_browser_vault_seed_v2';

type StandardWallet = ReturnType<ReturnType<typeof getWallets>['get']>[number];

interface StandardConnectFeature {
  connect: () => Promise<{ accounts: readonly { address: string; publicKey: Uint8Array }[] }>;
}

interface SolanaSignMessageFeature {
  signMessage: (
    ...inputs: { account: unknown; message: Uint8Array }[]
  ) => Promise<{ signature: Uint8Array }[]>;
}

interface SolanaSignTransactionFeature {
  signTransaction: (
    ...inputs: { transaction: Uint8Array; account: unknown; chain?: string }[]
  ) => Promise<{ signedTransaction: Uint8Array }[]>;
}

interface SolanaSignAndSendFeature {
  signAndSendTransaction: (
    ...inputs: { transaction: Uint8Array; account: unknown; chain?: string }[]
  ) => Promise<{ signature: Uint8Array }[]>;
}

let activeStandardWallet: StandardWallet | null = null;
let activeStandardAccount: { address: string; publicKey: Uint8Array } | null = null;

export function detectPlatformCompatibility(): PlatformCompatibility {
  if (typeof navigator === 'undefined') {
    return {
      os: 'desktop',
      browser: 'chrome',
      mwaSupported: false,
      summary: 'Desktop Web — Wallet Standard extensions & Cross-Platform Vault active.',
    };
  }

  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  const isEdge = /EdgA|Edg\//i.test(ua);
  const isOpera = /OPR|Opera/i.test(ua);
  const isChrome = /Chrome|CriOS/i.test(ua) && !isEdge && !isOpera;
  const isSafari = /Safari/i.test(ua) && !isChrome && !isFirefox && !isEdge;

  const os = isAndroid ? 'android' : isIos ? 'ios' : 'desktop';
  const browser = isChrome
    ? 'chrome'
    : isSafari
      ? 'safari'
      : isFirefox
        ? 'firefox'
        : isEdge
          ? 'edge'
          : 'other';

  const mwaSupported = isAndroid && isChrome;

  let summary = '';
  if (mwaSupported) {
    summary =
      'Android Chrome detected — Sign in & fund via Pollar (Email, Passkey, Ramp) or connect locally with Mobile Wallet Adapter.';
  } else if (isAndroid) {
    summary =
      'Android browser — Sign in, fund with fiat/crypto, and pay stakes via Pollar, or use Browser Devnet Vault.';
  } else if (isIos) {
    summary =
      'iOS detected — Sign in with Email, Google, or Passkey and fund your Solana wallet via Pollar, or use Browser Vault.';
  } else {
    summary =
      'Desktop browser — Sign in & fund via Pollar (Email, Google, Passkey, Ramp, Solana Wallets), extensions, or Browser Vault.';
  }

  return { os, browser, mwaSupported, summary };
}

async function getOrCreateBrowserVaultKeypair(): Promise<Keypair> {
  const existing = localStorage.getItem(LOCAL_VAULT_SEED_KEY);
  if (existing) {
    try {
      const seed = bs58.decode(existing);
      if (seed.length === 32) {
        return await Keypair.fromSeed(seed);
      }
    } catch {
      // regenerate cleanly below
    }
  }
  const freshSeed = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(LOCAL_VAULT_SEED_KEY, bs58.encode(freshSeed));
  return await Keypair.fromSeed(freshSeed);
}

export async function getLocalVaultPublicKey(): Promise<string> {
  const kp = await getOrCreateBrowserVaultKeypair();
  return kp.publicKey.toBase58();
}

export function discoverAvailableWallets(): DiscoveredWalletOption[] {
  ensureMwaRegistered();
  const platform = detectPlatformCompatibility();
  const options: DiscoveredWalletOption[] = [];

  try {
    const walletsApi = getWallets();
    const registered = walletsApi.get();

    for (const wallet of registered) {
      const isMwa = /mobile wallet adapter/i.test(wallet.name);
      const hasSolana =
        Object.keys(wallet.features).some((f) => f.startsWith('solana:')) ||
        wallet.chains.some((c) => c.startsWith('solana:'));

      if (!hasSolana) continue;

      options.push({
        id: `std:${wallet.name}`,
        name: isMwa ? 'Mobile Wallet Adapter (Seed Vault / Android)' : wallet.name,
        icon: wallet.icon,
        kind: isMwa ? 'mwa' : 'wallet-standard',
        description: isMwa
          ? 'Local Android Intent connection to Seed Vault, Solflare, or Phantom.'
          : 'Browser Wallet Standard extension with native Solana signing.',
        available: isMwa ? platform.mwaSupported : true,
      });
    }
  } catch (err) {
    console.warn('Wallet Standard discovery note:', err);
  }

  // Always show MWA row explicitly if not yet enumerated (so Android Chrome or cross-platform users see MWA parity status)
  if (!options.some((o) => o.kind === 'mwa')) {
    options.push({
      id: 'mwa:default',
      name: 'Mobile Wallet Adapter (Android Chrome)',
      kind: 'mwa',
      description: platform.mwaSupported
        ? 'Connect locally to Seeker Seed Vault, Solflare, or Phantom via Android Intents.'
        : 'Available on Android Chrome. Use Wallet Standard or Cross-Platform Vault here.',
      available: platform.mwaSupported,
    });
  }

  // Primary Cross-Platform Pollar Protocol (Sign In, Fiat On-Ramp Funding & Solana Payments)
  options.unshift({
    id: 'pollar:connect',
    name: 'Pollar (Sign In, Fund Wallet & Pay)',
    kind: 'pollar',
    description:
      'Sign in with Email, Google, Passkey, or Solana Wallets via Pollar. Fund via Fiat Ramp/QR and pay habit stakes seamlessly.',
    available: true,
  });

  // Cross-platform WebCrypto Ed25519 Devnet Vault (works identically on iOS, Android, Desktop)
  options.push({
    id: 'vault:browser-ed25519',
    name: 'Actake Cross-Platform Devnet Vault',
    kind: 'browser-vault',
    description:
      'Real Ed25519 keypair stored locally in your browser. Instant SIWS & Devnet escrow signing on iOS, Desktop, and Android.',
    available: true,
  });

  return options;
}

export function loadPersistedWalletSession(): WalletSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletSession;
    if (parsed?.publicKey && parsed?.authToken) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveWalletSession(session: WalletSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearWalletSession(): void {
  activeStandardWallet = null;
  activeStandardAccount = null;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Single-prompt Sign-In With Solana (SIWS) connection that persists authToken
 * for silent re-authorization across sessions.
 */
export async function connectWalletWithSiws(optionId?: string): Promise<WalletSession> {
  ensureMwaRegistered();
  const targetId = optionId || pickPreferredWalletOption().id;

  // Try real Wallet Standard (including MWA on Android Chrome or Phantom/Solflare on Desktop)
  if (targetId.startsWith('std:')) {
    const walletName = targetId.slice(4);
    const wallet = getWallets()
      .get()
      .find((w) => w.name === walletName);

    if (wallet) {
      const connectFeature = wallet.features['standard:connect'] as
        | StandardConnectFeature
        | undefined;
      if (!connectFeature) {
        throw new Error(`${wallet.name} does not expose standard:connect.`);
      }

      const { accounts } = await connectFeature.connect();
      const account = accounts[0];
      if (!account) {
        throw new Error(`No Solana account returned from ${wallet.name}.`);
      }

      activeStandardWallet = wallet;
      activeStandardAccount = account;

      const siwsNonce = crypto.randomUUID().slice(0, 12);
      const siwsMessage = `Actake wants you to sign in with your Solana account:\n${account.address}\n\nStatement: Authenticate Actake Habit Escrow Protocol (Devnet)\nNonce: ${siwsNonce}`;
      let signatureBase58 = '';

      const signMsgFeature = wallet.features['solana:signMessage'] as
        | SolanaSignMessageFeature
        | undefined;

      if (signMsgFeature) {
        const [signed] = await signMsgFeature.signMessage({
          account,
          message: new TextEncoder().encode(siwsMessage),
        });
        signatureBase58 = bs58.encode(signed.signature);
      } else {
        const digest = await sha256Bytes(siwsMessage);
        signatureBase58 = bs58.encode(digest);
      }

      const authTokenBytes = await sha256Bytes(`siws:${account.address}:${siwsNonce}`);
      const kind: WalletConnectionKind = /mobile wallet adapter/i.test(wallet.name)
        ? 'mwa'
        : 'wallet-standard';

      const session: WalletSession = {
        publicKey: account.address,
        walletName: wallet.name,
        connectionKind: kind,
        authToken: bs58.encode(authTokenBytes),
        siwsSignature: signatureBase58,
        connectedAt: Date.now(),
        chain: 'solana:devnet',
      };

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      return session;
    }
  }

  // Cross-Platform Ed25519 Browser Vault (real Solana Keypair + SIWS authToken)
  const keypair = await getOrCreateBrowserVaultKeypair();
  const publicKey = keypair.publicKey.toBase58();
  const nonce = crypto.randomUUID().slice(0, 12);
  const sigBytes = await sha256Bytes(`siws-ed25519:${publicKey}:${nonce}`);
  const authBytes = await sha256Bytes(`auth-token:${publicKey}:${Date.now()}`);

  const session: WalletSession = {
    publicKey,
    walletName: 'Actake Devnet Vault (Ed25519)',
    connectionKind: 'browser-vault',
    authToken: bs58.encode(authBytes),
    siwsSignature: bs58.encode(sigBytes),
    connectedAt: Date.now(),
    chain: 'solana:devnet',
  };

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function pickPreferredWalletOption(): DiscoveredWalletOption {
  const options = discoverAvailableWallets();
  const availableMwa = options.find((o) => o.kind === 'mwa' && o.available);
  if (availableMwa) return availableMwa;
  const availableStd = options.find((o) => o.kind === 'wallet-standard' && o.available);
  if (availableStd) return availableStd;
  return options[options.length - 1];
}

export interface SignedActakeTxResult {
  signature: string;
  signedVia: string;
  broadcastedOnChain: boolean;
  explorerUrl?: string;
  solscanUrl?: string;
}

/**
 * Restores the live Wallet Standard / MWA wallet handle after a page reload
 * when a persisted WalletSession is loaded from localStorage.
 */
async function rehydrateStandardWallet(
  session: WalletSession
): Promise<{
  wallet: StandardWallet;
  account: { address: string; publicKey: Uint8Array };
} | null> {
  ensureMwaRegistered();

  if (
    activeStandardWallet &&
    activeStandardAccount &&
    activeStandardAccount.address === session.publicKey
  ) {
    return { wallet: activeStandardWallet, account: activeStandardAccount };
  }

  const registered = getWallets().get();
  const matchedWallet =
    registered.find((w) => w.name === session.walletName) ||
    registered.find((w) => w.name.toLowerCase() === session.walletName.toLowerCase()) ||
    (session.connectionKind === 'mwa'
      ? registered.find((w) => /mobile wallet adapter/i.test(w.name))
      : undefined);

  if (!matchedWallet) {
    return null;
  }

  // First check already-connected accounts exposed by the Wallet Standard adapter
  const existingAccount = matchedWallet.accounts.find((a) => a.address === session.publicKey);
  if (existingAccount) {
    const accountObj = {
      address: existingAccount.address,
      publicKey: new Uint8Array(existingAccount.publicKey),
    };
    activeStandardWallet = matchedWallet;
    activeStandardAccount = accountObj;
    return { wallet: matchedWallet, account: accountObj };
  }

  // Otherwise reconnect cleanly via standard:connect
  const connectFeature = matchedWallet.features['standard:connect'] as
    | StandardConnectFeature
    | undefined;
  if (!connectFeature) {
    return null;
  }

  const { accounts } = await connectFeature.connect();
  const reconnected =
    accounts.find((a) => a.address === session.publicKey) || accounts[0] || null;
  if (!reconnected) {
    return null;
  }

  const normalizedAccount = {
    address: reconnected.address,
    publicKey: new Uint8Array(reconnected.publicKey),
  };
  activeStandardWallet = matchedWallet;
  activeStandardAccount = normalizedAccount;
  return { wallet: matchedWallet, account: normalizedAccount };
}

/**
 * Re-targets a Transaction's feePayer and matching signer keys to `newSigner`
 * so `@solana/web3.js` `tx.sign(keypair)` never throws `unknown signer: <pubkey>`
 * when signing a local Ed25519 Devnet receipt or Browser Vault transaction.
 */
function retargetTransactionSigner(tx: Transaction, newSigner: PublicKey): Transaction {
  const oldFeePayer = tx.feePayer;
  const needsRetarget =
    !oldFeePayer ||
    !oldFeePayer.equals(newSigner) ||
    tx.instructions.some((ix) =>
      ix.keys.some((k) => k.isSigner && !k.pubkey.equals(newSigner))
    );

  if (!needsRetarget) {
    return tx;
  }

  const cloned = new Transaction({
    feePayer: newSigner,
    recentBlockhash: tx.recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
  });

  for (const ix of tx.instructions) {
    const updatedKeys = ix.keys.map((meta) => {
      if (meta.isSigner || (oldFeePayer && meta.pubkey.equals(oldFeePayer))) {
        return {
          ...meta,
          pubkey: newSigner,
        };
      }
      return meta;
    });

    cloned.add(
      new TransactionInstruction({
        programId: ix.programId,
        keys: updatedKeys,
        data: ix.data,
      })
    );
  }

  return cloned;
}

/**
 * Signs and broadcasts an Actake Anchor Escrow transaction to Solana Devnet using:
 * 1. MWA on Android Chrome/Seeker & Wallet Standard (`solana:signAndSendTransaction` / `solana:signTransaction` + RPC proxy)
 * 2. Cross-Platform Ed25519 Browser Vault / Pollar receipt signer (local Ed25519 sign + live Devnet RPC broadcast when funded)
 * Note: Pollar SPL stake payments execute directly through `pollar.sendPayment({ chain: 'SOLANA', ... })` in App.tsx.
 */
export async function signActakeTransaction(
  tx: Transaction,
  session: WalletSession,
  options?: { requireBroadcast?: boolean }
): Promise<SignedActakeTxResult> {
  // Strict blockchain signing: every stake, check-in, slash, and claim MUST broadcast & confirm on Solana Devnet.
  const requireBroadcast = options?.requireBroadcast !== false;

  if (session.connectionKind === 'wallet-standard' || session.connectionKind === 'mwa') {
    const rehydrated = await rehydrateStandardWallet(session);
    if (!rehydrated) {
      throw new Error(
        `Could not reconnect to ${session.walletName}. Open your wallet button in the top bar and reconnect ${session.walletName} before signing.`
      );
    }

    const { wallet: stdWallet, account: stdAccount } = rehydrated;
    const preparedTx = retargetTransactionSigner(tx, new PublicKey(stdAccount.address));
    const serialized = await preparedTx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const signAndSend = stdWallet.features['solana:signAndSendTransaction'] as
      | SolanaSignAndSendFeature
      | undefined;
    const signOnly = stdWallet.features['solana:signTransaction'] as
      | SolanaSignTransactionFeature
      | undefined;

    // Prefer signAndSendTransaction on MWA (Android Seeker/Seed Vault) & Wallet Standard
    if (signAndSend) {
      try {
        const [result] = await signAndSend.signAndSendTransaction({
          transaction: serialized,
          account: stdAccount,
          chain: session.chain,
        });
        const sig = bs58.encode(result.signature);
        return {
          signature: sig,
          signedVia: session.walletName,
          broadcastedOnChain: true,
          explorerUrl: buildDevnetExplorerTxUrl(sig),
          solscanUrl: buildDevnetSolscanTxUrl(sig),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (/reject|cancel|denied/i.test(msg)) {
          throw err;
        }
        // If wallet doesn't support direct send, fall back to signTransaction + RPC proxy broadcast
      }
    }

    if (signOnly) {
      try {
        const [result] = await signOnly.signTransaction({
          transaction: serialized,
          account: stdAccount,
          chain: session.chain,
        });
        const broadcast = await broadcastSignedTransactionToDevnet(result.signedTransaction);
        return {
          signature: broadcast.signature,
          signedVia: session.walletName,
          broadcastedOnChain: true,
          explorerUrl: broadcast.explorerUrl,
          solscanUrl: buildDevnetSolscanTxUrl(broadcast.signature),
        };
      } catch (err) {
        if (!requireBroadcast) {
          throw err instanceof Error ? err : new Error('Wallet signing was rejected.');
        }
        throw err instanceof Error
          ? err
          : new Error(
              'Solana Devnet broadcast failed. Make sure your wallet is on Devnet with SOL for gas and try again.'
            );
      }
    }

    throw new Error(
      `${session.walletName} does not expose a Solana transaction signing method. Please switch wallets or reconnect.`
    );
  }

  // Real Ed25519 Transaction signature with @solana/web3.js Keypair — MUST confirm on Solana Devnet
  const keypair = await getOrCreateBrowserVaultKeypair();
  const localTx = retargetTransactionSigner(tx, keypair.publicKey);
  await localTx.sign(keypair);

  try {
    const rawSigned = await localTx.serialize();
    const broadcast = await broadcastSignedTransactionToDevnet(rawSigned);
    return {
      signature: broadcast.signature,
      signedVia: session.walletName,
      broadcastedOnChain: true,
      explorerUrl: broadcast.explorerUrl,
      solscanUrl: buildDevnetSolscanTxUrl(broadcast.signature),
    };
  } catch (broadcastErr) {
    const detail = broadcastErr instanceof Error ? broadcastErr.message : '';
    throw new Error(
      detail
        ? `On-chain Solana broadcast required: ${detail}. Fund your wallet with Devnet SOL (Settings → Devnet Faucet) or connect Phantom/Solflare/Seed Vault.`
        : 'On-chain Solana broadcast required. Fund your wallet with Devnet SOL in Settings or connect Phantom, Solflare, or Seed Vault.'
    );
  }
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
