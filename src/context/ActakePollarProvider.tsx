import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  type PollarClient,
  type SendPaymentParams,
  type SubmitOutcome,
  type WalletBalanceState,
  type WalletInfo,
} from '@pollar/core';
import { PollarProvider, usePollar } from '@pollar/react';
import '@pollar/react/styles.css';
import {
  createActakePollarClient,
  extractSolanaWalletFromPollar,
  forceRefreshActakePollarBalance,
  isPollarConfigured,
  resetActakePollarRateGuards,
  summarizePollarSolanaBalances,
  type PollarSolanaBalanceSummary,
} from '../solana/pollarBridge';

export type PollarConfigErrorCode =
  | 'ORIGIN_NOT_ALLOWED'
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UPSTREAM_ERROR'
  | null;

export interface ActakePollarContextValue {
  configured: boolean;
  isAuthenticated: boolean;
  verified: boolean;
  hasWallet: boolean;
  configStatus: 'loading' | 'ready' | 'error' | 'unconfigured';
  configErrorCode: PollarConfigErrorCode;
  currentOrigin: string;
  wallet: WalletInfo | null;
  solanaWallet: WalletInfo | null;
  wallets: WalletInfo[];
  walletBalance: WalletBalanceState;
  solanaBalances: PollarSolanaBalanceSummary;
  retryConfig: () => Promise<boolean>;
  openLoginModal: () => void;
  openRampModal: () => void;
  openReceiveModal: () => void;
  openSendModal: () => void;
  openWalletBalanceModal: () => void;
  openTxHistoryModal: () => void;
  logout: () => void;
  createWallet: () => Promise<WalletInfo | null>;
  refreshWalletBalance: (force?: boolean) => Promise<void>;
  sendPayment: (params: SendPaymentParams) => Promise<SubmitOutcome>;
}

const BROWSER_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

const UNCONFIGURED_VALUE: ActakePollarContextValue = {
  configured: false,
  isAuthenticated: false,
  verified: false,
  hasWallet: false,
  configStatus: 'unconfigured',
  configErrorCode: null,
  currentOrigin: BROWSER_ORIGIN,
  wallet: null,
  solanaWallet: null,
  wallets: [],
  walletBalance: { step: 'idle' },
  solanaBalances: {
    sol: null,
    usdc: null,
    skr: null,
    records: [],
    loaded: false,
    loading: false,
    error: null,
  },
  retryConfig: async () => false,
  openLoginModal: () => {},
  openRampModal: () => {},
  openReceiveModal: () => {},
  openSendModal: () => {},
  openWalletBalanceModal: () => {},
  openTxHistoryModal: () => {},
  logout: () => {},
  createWallet: async () => null,
  refreshWalletBalance: async () => {},
  sendPayment: async () => ({
    status: 'error',
    code: 'POLLAR_UNCONFIGURED',
    message: 'Add VITE_POLLAR_API_KEY in AI Studio Secrets to enable Pollar payments.',
  }),
};

const ActakePollarContext = createContext<ActakePollarContextValue>(UNCONFIGURED_VALUE);

function serializeWallet(w: WalletInfo | null): string {
  if (!w) return '';
  return `${w.chain || ''}:${w.address || ''}:${w.custody || ''}:${w.provider || ''}`;
}

const PollarLiveBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pollar = usePollar();
  const [configErrorCode, setConfigErrorCode] = useState<PollarConfigErrorCode>(null);
  const currentOrigin = BROWSER_ORIGIN;

  // Keep latest Pollar methods in a ref so exported callbacks keep stable references
  // and never re-trigger downstream useEffect hooks on balance/loading updates.
  const pollarRef = useRef(pollar);
  pollarRef.current = pollar;

  const creatingWalletRef = useRef<Promise<WalletInfo | null> | null>(null);
  const inspectInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastInspectAtRef = useRef<number>(0);

  const inspectPollarError = useCallback(async (force = false): Promise<boolean> => {
    if (inspectInFlightRef.current) return inspectInFlightRef.current;
    const now = Date.now();
    if (!force && now - lastInspectAtRef.current < 15_000) {
      return false;
    }
    lastInspectAtRef.current = now;

    const task = (async () => {
      try {
        const resp = await fetch(
          `/api/system/pollar-check?origin=${encodeURIComponent(currentOrigin)}`
        );
        if (!resp.ok) {
          setConfigErrorCode('NETWORK_ERROR');
          return false;
        }
        const data = (await resp.json()) as {
          reachable?: boolean;
          status?: number;
          errorCode?: string | null;
        };
        if (data.reachable) {
          setConfigErrorCode(null);
          return true;
        }
        if (data.status === 429 || data.errorCode === 'RATE_LIMITED') {
          setConfigErrorCode('RATE_LIMITED');
        } else if (data.errorCode === 'ORIGIN_NOT_ALLOWED') {
          setConfigErrorCode('ORIGIN_NOT_ALLOWED');
        } else if (data.errorCode === 'INVALID_API_KEY') {
          setConfigErrorCode('INVALID_API_KEY');
        } else if (data.errorCode === 'NETWORK_ERROR') {
          setConfigErrorCode('NETWORK_ERROR');
        } else {
          setConfigErrorCode('UPSTREAM_ERROR');
        }
        return false;
      } catch {
        setConfigErrorCode('NETWORK_ERROR');
        return false;
      } finally {
        inspectInFlightRef.current = null;
      }
    })();

    inspectInFlightRef.current = task;
    return task;
  }, [currentOrigin]);

  useEffect(() => {
    if (pollar.configStatus === 'error') {
      void inspectPollarError();
    } else if (pollar.configStatus === 'ready') {
      setConfigErrorCode((prev) => (prev !== null ? null : prev));
    }
  }, [pollar.configStatus, inspectPollarError]);

  // Reset rate guards when user logs out
  useEffect(() => {
    if (!pollar.isAuthenticated) {
      creatingWalletRef.current = null;
      resetActakePollarRateGuards();
    }
  }, [pollar.isAuthenticated]);

  const retryConfig = useCallback(async (): Promise<boolean> => {
    resetActakePollarRateGuards({ includeConfig: true });
    pollarRef.current.retryConfig();
    return await inspectPollarError(true);
  }, [inspectPollarError]);

  const createWallet = useCallback(async (): Promise<WalletInfo | null> => {
    if (creatingWalletRef.current) return creatingWalletRef.current;
    const task = (async () => {
      try {
        return await pollarRef.current.createWallet();
      } catch {
        return null;
      } finally {
        creatingWalletRef.current = null;
      }
    })();
    creatingWalletRef.current = task;
    return task;
  }, []);

  const refreshWalletBalance = useCallback(async (force = false): Promise<void> => {
    if (!pollarRef.current.isAuthenticated || !pollarRef.current.hasWallet) return;
    if (force) {
      await forceRefreshActakePollarBalance();
    } else {
      await pollarRef.current.refreshWalletBalance();
    }
  }, []);

  const openLoginModal = useCallback(() => pollarRef.current.openLoginModal(), []);
  const openRampModal = useCallback(() => pollarRef.current.openRampModal(), []);
  const openReceiveModal = useCallback(() => pollarRef.current.openReceiveModal(), []);
  const openSendModal = useCallback(() => pollarRef.current.openSendModal(), []);
  const openWalletBalanceModal = useCallback(() => pollarRef.current.openWalletBalanceModal(), []);
  const openTxHistoryModal = useCallback(() => pollarRef.current.openTxHistoryModal(), []);
  const logout = useCallback(() => {
    resetActakePollarRateGuards();
    pollarRef.current.logout();
  }, []);
  const sendPayment = useCallback(
    (params: SendPaymentParams) => pollarRef.current.sendPayment(params),
    []
  );

  // Stabilize wallet / wallets / solanaWallet by value identity because PollarProvider
  // calls getWallet()/getWallets() inside its context useMemo on every balance update.
  const primaryWalletKey = serializeWallet(pollar.wallet);
  const walletsKey = pollar.wallets.map(serializeWallet).join('|');

  const stableWallet = useMemo(
    () => pollarRef.current.wallet,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [primaryWalletKey]
  );

  const stableWallets = useMemo(
    () => pollarRef.current.wallets,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walletsKey]
  );

  const solanaWallet = useMemo(
    () => extractSolanaWalletFromPollar(stableWallets, stableWallet),
    [stableWallets, stableWallet]
  );

  const solanaBalances = useMemo(
    () => summarizePollarSolanaBalances(pollar.walletBalance),
    [pollar.walletBalance]
  );

  const value = useMemo<ActakePollarContextValue>(
    () => ({
      configured: true,
      isAuthenticated: pollar.isAuthenticated,
      verified: pollar.verified,
      hasWallet: pollar.hasWallet,
      configStatus: pollar.configStatus,
      configErrorCode,
      currentOrigin,
      wallet: stableWallet,
      solanaWallet,
      wallets: stableWallets,
      walletBalance: pollar.walletBalance,
      solanaBalances,
      retryConfig,
      openLoginModal,
      openRampModal,
      openReceiveModal,
      openSendModal,
      openWalletBalanceModal,
      openTxHistoryModal,
      logout,
      createWallet,
      refreshWalletBalance,
      sendPayment,
    }),
    [
      pollar.isAuthenticated,
      pollar.verified,
      pollar.hasWallet,
      pollar.configStatus,
      configErrorCode,
      currentOrigin,
      stableWallet,
      solanaWallet,
      stableWallets,
      pollar.walletBalance,
      solanaBalances,
      retryConfig,
      openLoginModal,
      openRampModal,
      openReceiveModal,
      openSendModal,
      openWalletBalanceModal,
      openTxHistoryModal,
      logout,
      createWallet,
      refreshWalletBalance,
      sendPayment,
    ]
  );

  return <ActakePollarContext.Provider value={value}>{children}</ActakePollarContext.Provider>;
};

export const ActakePollarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pollarClient = useMemo<PollarClient | null>(() => {
    if (!isPollarConfigured()) return null;
    try {
      return createActakePollarClient();
    } catch (err) {
      console.warn('PollarClient initialization fallback:', err);
      return null;
    }
  }, []);

  if (!pollarClient) {
    return (
      <ActakePollarContext.Provider value={UNCONFIGURED_VALUE}>
        {children}
      </ActakePollarContext.Provider>
    );
  }

  return (
    <PollarProvider client={pollarClient}>
      <PollarLiveBridge>{children}</PollarLiveBridge>
    </PollarProvider>
  );
};

export function useActakePollar(): ActakePollarContextValue {
  return useContext(ActakePollarContext);
}
