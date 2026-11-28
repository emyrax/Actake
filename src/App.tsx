import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Loader2,
  MapPin,
  Search,
  Settings,
  Wallet,
} from 'lucide-react';
import {
  AlarmSettings,
  AppTab,
  CelebrationReceipt,
  DevnetSyncState,
  DiscoveredWalletOption,
  GeoHuntZone,
  GlobalActivitySummary,
  HabitCategory,
  HistoryEntry,
  PoolTractionSummary,
  RandomizedTargetPrompt,
  SquadPool,
  StakeCommitment,
  TokenType,
  TreasurySummaryReport,
  VerificationResult,
  WalletSession,
} from './types/actake';
import {
  clearWalletSession,
  connectWalletWithSiws,
  detectPlatformCompatibility,
  discoverAvailableWallets,
  loadPersistedWalletSession,
  saveWalletSession,
  shortenAddress,
  signActakeTransaction,
} from './solana/walletManager';
import {
  buildActakeEscrowTransaction,
  buildActakeEscrowTransferTransaction,
  buildDevnetExplorerTxUrl,
  buildDevnetSolscanTxUrl,
  buildSquadBlinkUrl,
  buildSquadLobbyUrl,
  CONFIGURED_CLIENT_TREASURY_WALLET,
  deriveEscrowPoolPda,
  fetchDevnetTelemetry,
  fetchLatestDevnetBlockhash,
  fetchLiveSolPrice,
  resolveDirectTransferPlan,
  resolveStakeDepositDestination,
  TOKEN_CONFIGS,
} from './solana/actakeEscrow';
import {
  buildPollarDirectPaymentParams,
  formatPollarProviderLabel,
} from './solana/pollarBridge';
import { useActakePollar } from './context/ActakePollarProvider';
import {
  BUILTIN_CATEGORIES,
  loadUserData,
  PersistedUserData,
  saveUserData,
} from './data/localStore';
import { alarmAudio } from './utils/alarmAudio';
import { formatClockTime12h } from './utils/timeUtils';
import { derivePoolInviteCode, parsePoolInviteInput } from './utils/poolLinks';
import { safeFetchJson } from './utils/safeFetchJson';
import { BrandMark } from './components/BrandMark';
import { ActakeLandingPage } from './components/landing/ActakeLandingPage';
import { HomeView } from './components/HomeView';
import { MissionsView } from './components/MissionsView';
import { HuntsView } from './components/HuntsView';
import { SquadsView, ExploreHabitPreset } from './components/SquadsView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { AlarmChallengeModal } from './components/AlarmChallengeModal';
import { LiveCameraVerifyView } from './components/LiveCameraVerifyView';
import { CelebrationView } from './components/CelebrationView';
import { AlarmSettingsModal } from './components/AlarmSettingsModal';
import { WalletSheet } from './components/WalletSheet';
import { PollarModal } from './components/PollarModal';
import { LobbyPool, SquadLobbyView } from './components/SquadLobbyView';
import { ReadinessDrawer } from './components/ReadinessDrawer';
import { MascotLoader } from './components/MascotDisplay';
import { ToastHost, ToastMessage, ToastTone } from './components/UiPrimitives';

function readInitialPoolTargetFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/squad\/([^/]+)\/?$/);
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }
  const params = new URLSearchParams(window.location.search);
  const queryTarget =
    params.get('code') || params.get('pool') || params.get('invite');
  if (queryTarget) {
    const parsed = parsePoolInviteInput(queryTarget);
    return parsed?.token || queryTarget.trim();
  }
  return null;
}

const NAV_ITEMS: Array<{
  id: AppTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: 'Today', icon: CalendarDays },
  { id: 'squads', label: 'Explore', icon: Search },
  { id: 'hunts', label: 'Hunts', icon: MapPin },
  { id: 'history', label: 'Stats', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const pollar = useActakePollar();
  const platform = useMemo(() => detectPlatformCompatibility(), []);
  const [wallets, setWallets] = useState<DiscoveredWalletOption[]>(() =>
    discoverAvailableWallets()
  );
  const [wallet, setWallet] = useState<WalletSession | null>(() => loadPersistedWalletSession());
  const [bootSplash, setBootSplash] = useState(true);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Brief branded mascot splash entrance on initial load
  useEffect(() => {
    const id = window.setTimeout(() => {
      setBootSplash(false);
    }, 650);
    return () => window.clearTimeout(id);
  }, []);

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [pendingExplorePreset, setPendingExplorePreset] = useState<ExploreHabitPreset | null>(null);
  const [activeLobbyPoolId, setActiveLobbyPoolId] = useState<string | null>(() =>
    readInitialPoolTargetFromUrl()
  );
  const [globalActivity, setGlobalActivity] = useState<GlobalActivitySummary | null>(null);
  const [globalActivityLoading, setGlobalActivityLoading] = useState<boolean>(true);
  const [globalActivityError, setGlobalActivityError] = useState<string | null>(null);
  const [tractionByPoolId, setTractionByPoolId] = useState<Record<string, PoolTractionSummary>>({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [userData, setUserData] = useState<PersistedUserData | null>(() =>
    wallet ? loadUserData(wallet.publicKey) : null
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((tone: ToastTone, title: string, detail?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, tone, title, detail }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  // Solana Devnet telemetry (live SOL, SPL USDC, Token-2022 SKR, SOL/USD price & slot)
  const [devnet, setDevnet] = useState<DevnetSyncState>({
    slot: null,
    solBalance: null,
    usdcBalance: null,
    skrBalance: null,
    solPriceUsd: null,
    solChange24hPct: null,
    blockhash: null,
    lastSyncedAt: null,
    syncing: false,
    error: null,
  });

  // Active modals & verification flow
  const [submittingStake, setSubmittingStake] = useState(false);
  const [alarmSettingsOpen, setAlarmSettingsOpen] = useState(false);
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const [readinessDrawerOpen, setReadinessDrawerOpen] = useState(false);
  const [pollarModalMode, setPollarModalMode] = useState<'connect' | 'fund' | null>(null);
  const [claimingStakeId, setClaimingStakeId] = useState<string | null>(null);
  const [slashingStakeId, setSlashingStakeId] = useState<string | null>(null);
  const [treasurySummary, setTreasurySummary] = useState<TreasurySummaryReport | null>(null);
  const [treasurySummaryLoading, setTreasurySummaryLoading] = useState<boolean>(true);
  const [treasurySummaryError, setTreasurySummaryError] = useState<string | null>(null);
  const treasuryConfig = treasurySummary?.config ?? null;
  const awaitingPollarLoginRef = useRef(false);

  // Ringing alarm -> Challenge Pop-up -> Live Camera -> Celebration state machine
  const [ringingStake, setRingingStake] = useState<StakeCommitment | null>(null);
  const [ringingPoolId, setRingingPoolId] = useState<string | undefined>(undefined);
  const [activeChallenge, setActiveChallenge] = useState<RandomizedTargetPrompt | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [inLiveCamera, setInLiveCamera] = useState(false);
  const [alarmMuted, setAlarmMuted] = useState(false);
  const [celebrationReceipt, setCelebrationReceipt] = useState<CelebrationReceipt | null>(null);
  const [claimingPayout, setClaimingPayout] = useState(false);

  // Track last auto-triggered minute per stake so an alarm fires once per scheduled minute
  const triggeredMinuteMapRef = useRef<Map<string, string>>(new Map());
  // Track recently generated challenge targets in-session so consecutive triggers stay varied
  const recentGeneratedItemsRef = useRef<string[]>([]);

  // Refresh Wallet Standard list briefly after mount (extensions may register asynchronously)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setWallets(discoverAvailableWallets());
    }, 600);
    return () => window.clearTimeout(id);
  }, []);

  const lastSyncedPollarAddressRef = useRef<string | null>(null);
  const walletProvisionAttemptedRef = useRef<boolean>(false);

  const activePollarWallet = pollar.solanaWallet || pollar.wallet;
  const activePollarAddress = activePollarWallet?.address || null;
  const activePollarCustody = activePollarWallet?.custody;
  const activePollarProvider = activePollarWallet?.provider
    ? String(activePollarWallet.provider)
    : undefined;
  const activePollarLabel = activePollarWallet
    ? formatPollarProviderLabel(activePollarWallet)
    : 'Pollar Wallet';

  // Automatically bind Pollar authenticated Solana wallet into Actake's active WalletSession once per address
  useEffect(() => {
    if (!pollar.configured || !pollar.isAuthenticated) {
      lastSyncedPollarAddressRef.current = null;
      walletProvisionAttemptedRef.current = false;
      return;
    }

    if (!pollar.hasWallet) {
      if (!walletProvisionAttemptedRef.current) {
        walletProvisionAttemptedRef.current = true;
        void pollar.createWallet();
      }
      return;
    }

    if (!activePollarAddress) return;

    const alreadySyncedThisAddress =
      lastSyncedPollarAddressRef.current === activePollarAddress && !awaitingPollarLoginRef.current;
    if (alreadySyncedThisAddress) return;

    const shouldAdopt =
      awaitingPollarLoginRef.current || !wallet || wallet.connectionKind === 'pollar';

    if (!shouldAdopt) return;

    awaitingPollarLoginRef.current = false;
    lastSyncedPollarAddressRef.current = activePollarAddress;

    const nextSession: WalletSession = {
      publicKey: activePollarAddress,
      walletName: activePollarLabel,
      connectionKind: 'pollar',
      authToken: `pollar:${activePollarCustody || 'internal'}:${activePollarAddress.slice(0, 12)}`,
      siwsSignature: `pollar-session-${activePollarProvider || activePollarCustody || 'wallet'}`,
      connectedAt: Date.now(),
      chain: 'solana:devnet',
      pollarProvider: activePollarProvider,
      pollarCustody: activePollarCustody,
    };

    if (
      !wallet ||
      wallet.publicKey !== nextSession.publicKey ||
      wallet.connectionKind !== 'pollar'
    ) {
      saveWalletSession(nextSession);
      setWallet(nextSession);
    }

    setWalletError((prev) => (prev !== null ? null : prev));
    setWalletSheetOpen((prev) => (prev ? false : prev));
  }, [
    pollar.configured,
    pollar.isAuthenticated,
    pollar.hasWallet,
    activePollarAddress,
    activePollarCustody,
    activePollarProvider,
    activePollarLabel,
    pollar.createWallet,
    wallet?.publicKey,
    wallet?.connectionKind,
  ]);

  // Fetch Pollar Solana balance once per address only after config + session are verified
  const initialBalanceFetchedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !pollar.configured ||
      !pollar.isAuthenticated ||
      !pollar.verified ||
      !pollar.hasWallet ||
      pollar.configStatus !== 'ready' ||
      !activePollarAddress
    ) {
      if (!pollar.isAuthenticated) {
        initialBalanceFetchedForRef.current = null;
      }
      return;
    }
    if (initialBalanceFetchedForRef.current === activePollarAddress) return;
    initialBalanceFetchedForRef.current = activePollarAddress;
    const timer = window.setTimeout(() => {
      void pollar.refreshWalletBalance();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    pollar.configured,
    pollar.isAuthenticated,
    pollar.verified,
    pollar.hasWallet,
    pollar.configStatus,
    pollar.refreshWalletBalance,
    activePollarAddress,
  ]);

  // Sync browser back/forward navigation for /squad/:poolId and ?code=... URLs
  useEffect(() => {
    const onPopState = () => {
      setActiveLobbyPoolId(readInitialPoolTargetFromUrl());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refreshGlobalActivity = useCallback(async () => {
    setGlobalActivityLoading(true);
    setGlobalActivityError(null);
    try {
      const resp = await fetch('/api/activity/live');
      if (!resp.ok) {
        throw new Error(`Activity feed returned HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as GlobalActivitySummary;
      setGlobalActivity(data);
    } catch (err) {
      setGlobalActivityError(
        err instanceof Error ? err.message : 'Unable to reach live community pulse.'
      );
    } finally {
      setGlobalActivityLoading(false);
    }
  }, []);

  const refreshTreasurySummary = useCallback(async () => {
    setTreasurySummaryLoading(true);
    setTreasurySummaryError(null);
    try {
      const resp = await fetch('/api/treasury/summary');
      if (!resp.ok) {
        throw new Error(`Treasury summary returned HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as TreasurySummaryReport;
      setTreasurySummary(data);
    } catch (err) {
      setTreasurySummaryError(
        err instanceof Error ? err.message : 'Unable to load live Escrow & Treasury balances.'
      );
    } finally {
      setTreasurySummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGlobalActivity();
    void refreshTreasurySummary();
  }, [refreshGlobalActivity, refreshTreasurySummary]);

  const navigateToSquadLobby = useCallback((poolId: string) => {
    setActiveLobbyPoolId(poolId);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/squad/${encodeURIComponent(poolId)}`);
    }
  }, []);

  const exitSquadLobby = useCallback(() => {
    setActiveLobbyPoolId(null);
    setActiveTab('squads');
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
  }, []);

  // Load user store whenever wallet pubkey changes
  useEffect(() => {
    if (wallet) {
      setUserData(loadUserData(wallet.publicKey));
    } else {
      setUserData(null);
    }
  }, [wallet?.publicKey]);

  // Persist store updates scoped to connected wallet public key
  const updateUserData = useCallback(
    (updater: (prev: PersistedUserData) => PersistedUserData) => {
      setUserData((prev) => {
        if (!prev || !wallet) return prev;
        const next = updater(prev);
        saveUserData(wallet.publicKey, next);
        return next;
      });
    },
    [wallet]
  );

  const joinedPoolIdsKey = useMemo(() => {
    if (!userData) return '';
    return Array.from(
      new Set(
        userData.stakes
          .map((s) => s.poolId)
          .filter((id): id is string => Boolean(id))
      )
    )
      .sort()
      .join(',');
  }, [userData?.stakes]);

  const refreshPoolTractions = useCallback(async (idsCsv: string) => {
    if (!idsCsv) return;
    try {
      const resp = await fetch(`/api/pools/traction?ids=${encodeURIComponent(idsCsv)}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data?.tractionByPoolId && typeof data.tractionByPoolId === 'object') {
        setTractionByPoolId((prev) => ({
          ...prev,
          ...data.tractionByPoolId,
        }));
      }
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (!wallet || !joinedPoolIdsKey) return;
    void refreshPoolTractions(joinedPoolIdsKey);
  }, [wallet?.publicKey, joinedPoolIdsKey, refreshPoolTractions]);

  const handlePoolJoined = useCallback(
    (payload: {
      pool: LobbyPool;
      traction?: PoolTractionSummary;
      txSignature: string;
      broadcastedOnChain: boolean;
      explorerUrl?: string;
      solscanUrl?: string;
    }) => {
      if (!wallet) return;
      const { pool, traction, txSignature, broadcastedOnChain, explorerUrl, solscanUrl } = payload;
      const inviteCode = pool.inviteCode || derivePoolInviteCode(pool.id, pool.title);
      const tokenCfg = TOKEN_CONFIGS[pool.tokenSymbol];
      const timeLabel = formatClockTime12h(pool.alarmHour, pool.alarmMinute).full;

      if (traction) {
        setTractionByPoolId((prev) => ({
          ...prev,
          [pool.id]: traction,
        }));
      }

      updateUserData((prev) => {
        const alreadyActive = prev.stakes.some(
          (s) => s.poolId === pool.id && (s.status === 'locked' || s.status === 'verified')
        );

        const nextStakes = alreadyActive
          ? prev.stakes.map((s) =>
              s.poolId === pool.id
                ? {
                    ...s,
                    inviteCode,
                    squadName: pool.title,
                    totalDays: pool.totalDays,
                    alarmHour: pool.alarmHour,
                    alarmMinute: pool.alarmMinute,
                  }
                : s
            )
          : [
              {
                id: `pool-${pool.id}-${Date.now()}`,
                poolId: pool.id,
                inviteCode,
                categoryId: pool.categoryId || 'morning_wakeup',
                categoryName: pool.title,
                environmentHint:
                  pool.environmentHint || 'Daily randomized household or gym proof',
                frequencyLabel: `${pool.totalDays}-Day Team Pool`,
                amount: pool.stakeAmount,
                token: pool.tokenSymbol,
                protocolFeePct: tokenCfg.protocolFeePct,
                alarmHour: pool.alarmHour,
                alarmMinute: pool.alarmMinute,
                alarmSound: prev.alarmSettings.selectedSound,
                totalDays: pool.totalDays,
                escrowPda: pool.poolPubkey,
                escrowWallet: treasuryConfig?.escrowWallet || undefined,
                treasuryWallet:
                  treasuryConfig?.treasuryWallet || CONFIGURED_CLIENT_TREASURY_WALLET || undefined,
                joinTxSignature: txSignature,
                paidVia: (wallet.connectionKind === 'pollar' ? 'pollar' : 'solana-tx') as
                  | 'pollar'
                  | 'solana-tx',
                onchainConfirmed: broadcastedOnChain,
                explorerUrl,
                solscanUrl,
                recentBlockhash:
                  devnet.blockhash || 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
                createdAt: Date.now(),
                status: 'locked' as const,
                squadName: pool.title,
                slashedBonusEstimate: Number(
                  Math.max(
                    pool.stakeAmount * 0.2,
                    pool.slashedPotAvailable / Math.max(1, pool.participantCount)
                  ).toFixed(2)
                ),
              },
              ...prev.stakes,
            ];

        const hasSquad = prev.squads.some((sq) => sq.id === pool.id);
        const nextSquads = hasSquad
          ? prev.squads.map((sq) =>
              sq.id === pool.id
                ? {
                    ...sq,
                    inviteCode,
                    memberCount: Math.max(sq.memberCount, pool.participantCount),
                    totalPot: Math.max(sq.totalPot, pool.totalStaked),
                    slashedPot: Math.max(sq.slashedPot, pool.slashedPotAvailable),
                  }
                : sq
            )
          : [
              {
                id: pool.id,
                inviteCode,
                name: pool.title,
                categoryLabel: `Team Pool · ${pool.totalDays}-Day Cycle`,
                durationDays: pool.totalDays,
                alarmTimeLabel: timeLabel,
                alarmHour: pool.alarmHour,
                alarmMinute: pool.alarmMinute,
                stakeAmount: pool.stakeAmount,
                token: pool.tokenSymbol,
                memberCount: pool.participantCount,
                checkedInPct: traction?.checkedInPct ?? 0,
                totalPot: pool.totalStaked,
                slashedPot: pool.slashedPotAvailable,
                blinkUrl: buildSquadBlinkUrl({
                  poolId: pool.id,
                  squadName: pool.title,
                  amount: pool.stakeAmount,
                  token: pool.tokenSymbol,
                  alarmTime: timeLabel,
                  escrowPda: pool.poolPubkey,
                }),
                lobbyUrl: buildSquadLobbyUrl(pool.id),
                feed: [],
              },
              ...prev.squads,
            ];

        return {
          ...prev,
          stakes: nextStakes,
          squads: nextSquads,
        };
      });

      void refreshPoolTractions(pool.id);
      void refreshGlobalActivity();
      pushToast(
        'success',
        'Joined Pool & Added Alarm',
        `${pool.title} (${timeLabel}) is now on your Today alarms with live team traction.`
      );
    },
    [
      wallet,
      treasuryConfig?.escrowWallet,
      treasuryConfig?.treasuryWallet,
      devnet.blockhash,
      updateUserData,
      refreshPoolTractions,
      refreshGlobalActivity,
      pushToast,
    ]
  );

  // Live 1-second clock ticker
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Sync live Solana Devnet slot & SOL balance
  const syncDevnet = useCallback(
    async (pubkey?: string, notifyUser = false) => {
      setDevnet((prev) => ({ ...prev, syncing: true, error: null }));
      try {
        const result = await fetchDevnetTelemetry(pubkey);
        setDevnet((prev) => ({
          slot: result.slot,
          solBalance: result.solBalance,
          usdcBalance: result.usdcBalance,
          skrBalance: result.skrBalance,
          solPriceUsd: result.solPriceUsd ?? prev.solPriceUsd,
          solChange24hPct: result.solChange24hPct ?? prev.solChange24hPct,
          blockhash: result.blockhash,
          lastSyncedAt: Date.now(),
          syncing: false,
          error: null,
        }));
        if (notifyUser) {
          pushToast(
            'success',
            'Solana Devnet Synced',
            `Slot #${result.slot.toLocaleString()}${
              result.usdcBalance !== null ? ` · $${result.usdcBalance.toFixed(2)} USDC` : ''
            }${result.solBalance !== null ? ` · ${result.solBalance.toFixed(4)} SOL` : ''}`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Devnet sync failed';
        setDevnet((prev) => ({
          ...prev,
          syncing: false,
          error: msg,
        }));
        if (notifyUser) {
          pushToast('error', 'Devnet Sync Failed', msg);
        }
      }
    },
    [pushToast]
  );

  useEffect(() => {
    if (wallet) {
      void syncDevnet(wallet.publicKey, false);
    }
  }, [wallet?.publicKey, syncDevnet]);

  // Periodically refresh live SOL/USD market price & 24h fluctuation every 60s
  useEffect(() => {
    if (!wallet) return;
    let active = true;
    const refreshPrice = async () => {
      const quote = await fetchLiveSolPrice();
      if (!active || quote.solPriceUsd === null) return;
      setDevnet((prev) => ({
        ...prev,
        solPriceUsd: quote.solPriceUsd,
        solChange24hPct: quote.solChange24hPct ?? prev.solChange24hPct,
      }));
    };
    const timer = window.setInterval(() => {
      void refreshPrice();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [wallet?.publicKey]);

  // Fetch randomized AI challenge from Gemini 4 Hydrogen server route
  const requestChallengeForStake = useCallback(
    async (stake: StakeCommitment) => {
      setChallengeLoading(true);
      setChallengeError(null);
      setActiveChallenge(null);

      try {
        const combinedRecent = Array.from(
          new Set([
            ...recentGeneratedItemsRef.current,
            ...(userData?.recentVerifiedItems || []),
          ])
        ).slice(0, 10);

        const payload = await safeFetchJson<{
          challengeId: string;
          itemName: string;
          visualCue: string;
          antiCheatRule: string;
          referenceImageDataUrl: string;
          generatedAt: number;
          model: string;
        }>('/api/ai/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: stake.categoryId,
            categoryName: stake.categoryName,
            environmentHint: stake.environmentHint,
            recentItems: combinedRecent,
          }),
          retries: 1,
          fallbackError: 'Failed to generate AI verification challenge.',
        });

        if (payload.itemName) {
          recentGeneratedItemsRef.current = [
            String(payload.itemName),
            ...recentGeneratedItemsRef.current.filter(
              (item) => item.toLowerCase() !== String(payload.itemName).toLowerCase()
            ),
          ].slice(0, 10);
        }

        setActiveChallenge({
          challengeId: payload.challengeId,
          stakeId: stake.id,
          itemName: payload.itemName,
          visualCue: payload.visualCue,
          antiCheatRule: payload.antiCheatRule,
          referenceImageDataUrl: payload.referenceImageDataUrl,
          generatedAt: payload.generatedAt,
          model: payload.model,
        });
      } catch (err) {
        setChallengeError(err instanceof Error ? err.message : 'Unable to reach AI Oracle.');
      } finally {
        setChallengeLoading(false);
      }
    },
    [userData?.recentVerifiedItems]
  );

  // Trigger ringing alarm pop-up + loud Web Audio loop
  const triggerAlarmForStake = useCallback(
    (stake: StakeCommitment) => {
      if (ringingStake || inLiveCamera || celebrationReceipt) return;
      setRingingPoolId(stake.poolId);
      setRingingStake(stake);
      setInLiveCamera(false);
      setAlarmMuted(false);
      const volume = userData?.alarmSettings.volume ?? 0.85;
      const sound = stake.alarmSound || userData?.alarmSettings.selectedSound || 'siren';
      alarmAudio.startLoop(sound, volume);
      requestChallengeForStake(stake);
    },
    [ringingStake, inLiveCamera, celebrationReceipt, userData?.alarmSettings, requestChallengeForStake]
  );

  // Automatic foreground clock watcher: fires the moment any active stake's HH:MM arrives
  useEffect(() => {
    if (!wallet || !userData || ringingStake || inLiveCamera || celebrationReceipt) return;
    const now = new Date(nowMs);
    const curHour = now.getHours();
    const curMin = now.getMinutes();
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${curHour}:${curMin}`;

    for (const stake of userData.stakes) {
      if (stake.status !== 'locked') continue;
      if (stake.alarmHour === curHour && stake.alarmMinute === curMin) {
        const lastKey = triggeredMinuteMapRef.current.get(stake.id);
        if (lastKey !== minuteKey) {
          triggeredMinuteMapRef.current.set(stake.id, minuteKey);
          triggerAlarmForStake(stake);
          break;
        }
      }
    }
  }, [nowMs, wallet, userData, ringingStake, inLiveCamera, celebrationReceipt, triggerAlarmForStake]);

  const handleToggleMute = () => {
    if (!ringingStake || !userData) return;
    if (alarmMuted) {
      alarmAudio.startLoop(ringingStake.alarmSound, userData.alarmSettings.volume);
      setAlarmMuted(false);
    } else {
      alarmAudio.stop();
      setAlarmMuted(true);
    }
  };

  // Wallet connect / switch / disconnect (Pollar + MWA + Wallet Standard + Browser Vault)
  const handleConnectWallet = async (walletId: string) => {
    if (walletId === 'pollar:connect') {
      setWalletError(null);
      setWalletSheetOpen(false);
      if (!pollar.configured || pollar.configStatus === 'error') {
        setPollarModalMode('connect');
        return;
      }
      if (pollar.isAuthenticated) {
        const existing = pollar.solanaWallet || pollar.wallet;
        if (existing?.address) {
          const session: WalletSession = {
            publicKey: existing.address,
            walletName: formatPollarProviderLabel(existing),
            connectionKind: 'pollar',
            authToken: `pollar:${existing.custody}:${existing.address.slice(0, 12)}`,
            siwsSignature: `pollar-session-${existing.provider || existing.custody}`,
            connectedAt: Date.now(),
            chain: 'solana:devnet',
            pollarProvider: existing.provider ? String(existing.provider) : undefined,
            pollarCustody: existing.custody,
          };
          saveWalletSession(session);
          setWallet(session);
          void pollar.refreshWalletBalance();
          return;
        }
      }
      awaitingPollarLoginRef.current = true;
      pollar.openLoginModal();
      return;
    }

    setConnectingWallet(true);
    setWalletError(null);
    try {
      const session = await connectWalletWithSiws(walletId);
      setWallet(session);
      setWalletSheetOpen(false);
      pushToast('success', 'Wallet Connected', `${session.walletName} (${shortenAddress(session.publicKey)})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Wallet connection canceled or failed.';
      setWalletError(msg);
      pushToast('error', 'Wallet Connection Failed', msg);
    } finally {
      setConnectingWallet(false);
    }
  };

  const handleOpenPollarFund = useCallback(() => {
    setPollarModalMode('fund');
  }, []);

  const handleClearPendingExplorePreset = useCallback(() => {
    setPendingExplorePreset(null);
  }, []);

  const handleDisconnect = () => {
    alarmAudio.stop();
    awaitingPollarLoginRef.current = false;
    if (pollar.configured && pollar.isAuthenticated) {
      pollar.logout();
    }
    clearWalletSession();
    setWallet(null);
    setWalletSheetOpen(false);
    setPollarModalMode(null);
    setRingingStake(null);
    setActiveChallenge(null);
    setInLiveCamera(false);
    setCelebrationReceipt(null);
    pushToast('info', 'Wallet Disconnected', 'Your local Solana session has been cleared.');
  };

  // Shared helper: reads live sender balances + SOL/USD rate and executes a real Devnet value transfer
  // (Devnet SPL USDC when available, else live-priced native Devnet SOL) directly to Escrow or Treasury.
  const executeDirectOnChainTransfer = async (params: {
    instructionType: 'join_pool' | 'claim_payout' | 'slash_personal';
    destination: string;
    token: TokenType;
    usdAmount: number;
    escrowPda: string;
    escrowWallet?: string | null;
    treasuryWallet?: string | null;
    recentBlockhash: string;
    metadata?: Record<string, string | number>;
  }): Promise<{
    signature: string;
    broadcastedOnChain: boolean;
    explorerUrl?: string;
    solscanUrl?: string;
    paidVia: 'pollar' | 'solana-tx';
    settledAsset: 'USDC' | 'SOL';
    settledAmount: number;
    settledDestination: string;
  }> => {
    if (!wallet) {
      throw new Error('Connect a Solana wallet before sending an on-chain transfer.');
    }

    // Ensure we have live balances & live SOL/USD price before deciding SPL USDC vs SOL fallback
    let usdcBalance =
      wallet.connectionKind === 'pollar'
        ? (pollar.solanaBalances.usdc ?? devnet.usdcBalance)
        : devnet.usdcBalance;
    let solBalance =
      wallet.connectionKind === 'pollar'
        ? (pollar.solanaBalances.sol ?? devnet.solBalance)
        : devnet.solBalance;
    let solPriceUsd = devnet.solPriceUsd ?? treasurySummary?.onChain?.solPriceUsd ?? null;

    if (solBalance === null || usdcBalance === null || solPriceUsd === null) {
      try {
        const live = await fetchDevnetTelemetry(wallet.publicKey);
        if (solBalance === null) solBalance = live.solBalance;
        if (usdcBalance === null) usdcBalance = live.usdcBalance;
        if (solPriceUsd === null) solPriceUsd = live.solPriceUsd;
      } catch {
        if (solPriceUsd === null) {
          const quote = await fetchLiveSolPrice();
          solPriceUsd = quote.solPriceUsd;
        }
      }
    }

    const plan = resolveDirectTransferPlan({
      token: params.token,
      usdAmount: params.usdAmount,
      destination: params.destination,
      usdcBalance,
      solBalance,
      solPriceUsd,
      skipBalanceCheck: wallet.connectionKind === 'pollar' && !pollar.solanaBalances.loaded && solBalance === null,
    });

    if (wallet.connectionKind === 'pollar') {
      if (!pollar.configured) {
        throw new Error(
          'Pollar API key (VITE_POLLAR_API_KEY) is not configured for this deployment.'
        );
      }
      if (!pollar.isAuthenticated) {
        awaitingPollarLoginRef.current = true;
        pollar.openLoginModal();
        throw new Error(
          'Your Pollar session needs to be refreshed. Complete the Pollar sign-in prompt and try again.'
        );
      }

      const sendWithPlan = async (targetPlan: typeof plan) => {
        const paymentParams = buildPollarDirectPaymentParams({
          destination: targetPlan.destination,
          asset: targetPlan.asset,
          baseUnits: targetPlan.baseUnits,
          lamports: targetPlan.lamports,
          mint: targetPlan.mint,
        });
        return pollar.sendPayment(paymentParams);
      };

      let activePlan = plan;
      let outcome = await sendWithPlan(activePlan);

      // If Pollar attempted SPL USDC but failed due to missing/empty Devnet USDC, retry cleanly in live-priced SOL
      if (outcome.status === 'error' && activePlan.asset === 'USDC') {
        const solFallbackPlan = resolveDirectTransferPlan({
          token: 'SKR', // forces native SOL fallback calculation
          usdAmount: params.usdAmount,
          destination: params.destination,
          usdcBalance: 0,
          solBalance,
          solPriceUsd,
          skipBalanceCheck: true,
        });
        const retryOutcome = await sendWithPlan(solFallbackPlan);
        if (retryOutcome.status !== 'error') {
          activePlan = solFallbackPlan;
          outcome = retryOutcome;
        }
      }

      if (outcome.status === 'success' || outcome.status === 'pending') {
        void pollar.refreshWalletBalance();
        return {
          signature: outcome.hash,
          broadcastedOnChain: true,
          explorerUrl: buildDevnetExplorerTxUrl(outcome.hash),
          solscanUrl: buildDevnetSolscanTxUrl(outcome.hash),
          paidVia: 'pollar',
          settledAsset: activePlan.asset,
          settledAmount: activePlan.displayAmount,
          settledDestination: activePlan.destination,
        };
      }
      if (outcome.status === 'cosign_pending') {
        return {
          signature: `pollar-cosign-${outcome.request.id}`,
          broadcastedOnChain: false,
          paidVia: 'pollar',
          settledAsset: activePlan.asset,
          settledAmount: activePlan.displayAmount,
          settledDestination: activePlan.destination,
        };
      }
      throw new Error(
        outcome.message ||
          outcome.details ||
          'Pollar payment failed. Fund your Pollar Solana wallet with Devnet SOL or Devnet USDC and try again.'
      );
    }

    const tx = await buildActakeEscrowTransferTransaction({
      payerPublicKey: wallet.publicKey,
      recentBlockhash: params.recentBlockhash,
      instructionType: params.instructionType,
      escrowPda: params.escrowPda,
      escrowWallet: params.escrowWallet,
      treasuryWallet: params.treasuryWallet,
      token: params.token,
      amount: params.usdAmount,
      directTransfer: plan,
      metadata: params.metadata,
    });

    const txResult = await signActakeTransaction(tx, wallet, { requireBroadcast: true });
    return {
      signature: txResult.signature,
      broadcastedOnChain: txResult.broadcastedOnChain,
      explorerUrl: txResult.explorerUrl,
      solscanUrl: txResult.solscanUrl || buildDevnetSolscanTxUrl(txResult.signature),
      paidVia: 'solana-tx',
      settledAsset: plan.asset,
      settledAmount: plan.displayAmount,
      settledDestination: plan.destination,
    };
  };

  // Create stake via real Devnet SPL USDC or live-priced SOL transfer directly into Actake Escrow Wallet
  const handleCreateStake = async (params: {
    category: HabitCategory;
    amount: number;
    token: TokenType;
    alarmHour: number;
    alarmMinute: number;
    motivationNote?: string;
    frequencyLabel?: string;
  }) => {
    if (!wallet || !userData) return;
    setSubmittingStake(true);
    try {
      const [recentBlockhash, escrowPda] = await Promise.all([
        fetchLatestDevnetBlockhash(),
        deriveEscrowPoolPda(wallet.publicKey, params.category.id),
      ]);

      const depositTarget = resolveStakeDepositDestination({
        poolPda: escrowPda,
        runtimeEscrowWallet: treasuryConfig?.escrowWallet,
      });

      if (!depositTarget.safeForRealTokens) {
        throw new Error(
          'Set ACTAKE_ESCROW_WALLET (public Solana address) in your environment variables before staking so funds transfer on-chain to your Escrow wallet.'
        );
      }

      const transferResult = await executeDirectOnChainTransfer({
        instructionType: 'join_pool',
        destination: depositTarget.destination,
        token: params.token,
        usdAmount: params.amount,
        escrowPda,
        escrowWallet: depositTarget.destination,
        treasuryWallet: treasuryConfig?.treasuryWallet || CONFIGURED_CLIENT_TREASURY_WALLET,
        recentBlockhash,
        metadata: {
          categoryId: params.category.id,
          alarm: `${String(params.alarmHour).padStart(2, '0')}:${String(params.alarmMinute).padStart(2, '0')}`,
        },
      });

      const tokenCfg = TOKEN_CONFIGS[params.token];

      const newStake: StakeCommitment = {
        id: `stake-${Date.now()}`,
        categoryId: params.category.id,
        categoryName: params.category.name,
        environmentHint: params.category.environmentHint,
        motivationNote: params.motivationNote,
        frequencyLabel: params.frequencyLabel || 'Daily',
        amount: params.amount,
        token: params.token,
        protocolFeePct: tokenCfg.protocolFeePct,
        alarmHour: params.alarmHour,
        alarmMinute: params.alarmMinute,
        alarmSound: userData.alarmSettings.selectedSound,
        escrowPda,
        escrowWallet: depositTarget.destination,
        treasuryWallet: treasuryConfig?.treasuryWallet || CONFIGURED_CLIENT_TREASURY_WALLET || undefined,
        joinTxSignature: transferResult.signature,
        paidVia: transferResult.paidVia,
        settledAsset: transferResult.settledAsset,
        settledAmount: transferResult.settledAmount,
        settledDestination: transferResult.settledDestination,
        onchainConfirmed: transferResult.broadcastedOnChain,
        explorerUrl: transferResult.explorerUrl,
        solscanUrl: transferResult.solscanUrl,
        recentBlockhash,
        createdAt: Date.now(),
        status: 'locked',
        slashedBonusEstimate: Number((params.amount * (params.token === 'SKR' ? 0.24 : 0.18)).toFixed(2)),
      };

      updateUserData((prev) => ({
        ...prev,
        stakes: [newStake, ...prev.stakes],
      }));

      void fetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newStake.id,
          poolPubkey: escrowPda,
          title: params.category.name,
          categoryId: params.category.id,
          environmentHint: params.category.environmentHint,
          creatorPubkey: wallet.publicKey,
          tokenSymbol: params.token,
          poolType: 0,
          stakeAmount: params.amount,
          alarmHour: params.alarmHour,
          alarmMinute: params.alarmMinute,
          joinedTxSignature: transferResult.signature,
        }),
      }).then(() => {
        void refreshGlobalActivity();
        void refreshTreasurySummary();
        if (transferResult.broadcastedOnChain) {
          void syncDevnet(wallet.publicKey);
        }
      });

      const settledLabel =
        transferResult.settledAsset === 'USDC'
          ? `$${transferResult.settledAmount.toFixed(2)} SPL USDC`
          : `${transferResult.settledAmount.toFixed(4)} SOL (~$${params.amount.toFixed(2)})`;

      pushToast(
        'success',
        'Stake Transferred to Escrow',
        `${params.category.name} · ${settledLabel} sent on-chain to Actake Escrow for ${formatClockTime12h(params.alarmHour, params.alarmMinute).full}.`
      );
      setActiveTab('home');
    } finally {
      setSubmittingStake(false);
    }
  };

  // Handle verified live camera proof -> sign actake_escrow::submit_checkin -> Celebration!
  const handleVerificationPassed = async (result: VerificationResult, durationMs: number) => {
    if (!wallet || !userData || !ringingStake || !activeChallenge) return;

    alarmAudio.stop();

    const recentBlockhash = await fetchLatestDevnetBlockhash();
    const tx = buildActakeEscrowTransaction({
      payerPublicKey: wallet.publicKey,
      recentBlockhash,
      instructionType: 'submit_checkin',
      escrowPda: ringingStake.escrowPda,
      token: ringingStake.token,
      amount: ringingStake.amount,
      metadata: {
        item: activeChallenge.itemName,
        sha256: result.photoSha256.slice(0, 24),
        oracleSig: result.oracleSignature.slice(0, 24),
      },
      oracleAttestation:
        result.messageBytesHex && result.oraclePublicKey && result.oracleSignature
          ? {
              publicKeyHex: result.oraclePublicKey,
              signatureHex: result.oracleSignature,
              messageBytesHex: result.messageBytesHex,
            }
          : undefined,
    });

    const checkinResult = await signActakeTransaction(tx, wallet);
    void refreshGlobalActivity();
    if (checkinResult.broadcastedOnChain) {
      void syncDevnet(wallet.publicKey);
    }

    const tokenCfg = TOKEN_CONFIGS[ringingStake.token];
    const actPointsAwarded = 50 * tokenCfg.yieldMultiplier;
    const nextStreak = userData.streakDays + 1;

    // Request authoritative settlement quote from server (0% fee on SKR, 1.5% on USDC)
    let principalAmount = ringingStake.amount;
    let slashedBonus = ringingStake.slashedBonusEstimate;
    let totalEarned = Number((principalAmount + slashedBonus).toFixed(2));
    try {
      const quoteData = await safeFetchJson<{
        quote?: {
          principalAmount?: number;
          netSlashedBonus?: number;
          totalPayout?: number;
        };
      }>(`/api/pools/${encodeURIComponent(ringingPoolId || ringingStake.id)}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: wallet.publicKey,
          fallbackPrincipal: ringingStake.amount,
          fallbackToken: ringingStake.token,
        }),
        retries: 0,
      });
      if (quoteData?.quote) {
        principalAmount = Number(quoteData.quote.principalAmount ?? principalAmount);
        slashedBonus = Number(quoteData.quote.netSlashedBonus ?? slashedBonus);
        totalEarned = Number(quoteData.quote.totalPayout ?? totalEarned);
      }
    } catch {
      // fall back cleanly to local estimate
    }

    const now = new Date();
    const verifiedTimeLabel = formatClockTime12h(now.getHours(), now.getMinutes()).full;

    // Update persisted store: mark stake verified, push item to recent 7 anti-cheat exclusion list
    updateUserData((prev) => ({
      ...prev,
      streakDays: nextStreak,
      actPoints: prev.actPoints + actPointsAwarded,
      recentVerifiedItems: [
        activeChallenge.itemName,
        ...prev.recentVerifiedItems.filter(
          (i) => i.toLowerCase() !== activeChallenge.itemName.toLowerCase()
        ),
      ].slice(0, 7),
      stakes: prev.stakes.map((s) =>
        s.id === ringingStake.id ? { ...s, status: 'verified', slashedBonusEstimate: slashedBonus } : s
      ),
    }));

    const receipt: CelebrationReceipt = {
      stakeId: ringingStake.id,
      categoryName: ringingStake.categoryName,
      verifiedItemName: activeChallenge.itemName,
      verifiedTimeLabel,
      principalAmount,
      slashedBonus,
      totalEarned,
      token: ringingStake.token,
      actPointsAwarded,
      streakCount: nextStreak,
      checkinTxSignature: checkinResult.signature,
      checkinOnchainConfirmed: checkinResult.broadcastedOnChain,
      checkinExplorerUrl: checkinResult.explorerUrl,
      photoSha256: result.photoSha256,
      oracleSignature: result.oracleSignature,
      escrowPda: ringingStake.escrowPda,
      blinkUrl: buildSquadBlinkUrl({
        poolId: ringingPoolId || ringingStake.id,
        squadName: ringingStake.squadName || ringingStake.categoryName,
        amount: principalAmount,
        token: ringingStake.token,
        alarmTime: verifiedTimeLabel,
        escrowPda: ringingStake.escrowPda,
      }),
      claimed: false,
      confirmationMs: durationMs,
    };

    setInLiveCamera(false);
    setRingingStake(null);
    setRingingPoolId(undefined);
    setActiveChallenge(null);
    setCelebrationReceipt(receipt);
    const verifiedPoolTarget = ringingPoolId || ringingStake.poolId;
    if (verifiedPoolTarget) {
      void refreshPoolTractions(verifiedPoolTarget);
    }
  };

  // Sign & broadcast actake_escrow::claim_payout on Celebration screen, routing 1.5% USDC protocol fee on-chain to Treasury
  const handleClaimPayout = async () => {
    if (!wallet || !celebrationReceipt || celebrationReceipt.claimed) return;
    setClaimingPayout(true);
    try {
      const recentBlockhash = await fetchLatestDevnetBlockhash();
      const treasuryDestination =
        treasuryConfig?.treasuryWallet || CONFIGURED_CLIENT_TREASURY_WALLET;
      const protocolFeeUsd =
        celebrationReceipt.token === 'USDC'
          ? Number(
              (
                (celebrationReceipt.principalAmount + celebrationReceipt.slashedBonus) *
                (TOKEN_CONFIGS.USDC.protocolFeePct / 100)
              ).toFixed(4)
            )
          : 0;

      let claimSignature = '';
      let claimConfirmed = false;
      let claimExplorerUrl: string | undefined;
      let claimSolscanUrl: string | undefined;
      let settledAsset: 'USDC' | 'SOL' | undefined;
      let settledAmount: number | undefined;
      let settledDestination: string | undefined;

      if (protocolFeeUsd > 0 && treasuryDestination) {
        const feeTransfer = await executeDirectOnChainTransfer({
          instructionType: 'claim_payout',
          destination: treasuryDestination,
          token: celebrationReceipt.token,
          usdAmount: protocolFeeUsd,
          escrowPda: celebrationReceipt.escrowPda,
          escrowWallet: treasuryConfig?.escrowWallet,
          treasuryWallet: treasuryDestination,
          recentBlockhash,
          metadata: {
            checkinSig: celebrationReceipt.checkinTxSignature.slice(0, 16),
            protocolFeeUsd,
          },
        });
        claimSignature = feeTransfer.signature;
        claimConfirmed = feeTransfer.broadcastedOnChain;
        claimExplorerUrl = feeTransfer.explorerUrl;
        claimSolscanUrl = feeTransfer.solscanUrl;
        settledAsset = feeTransfer.settledAsset;
        settledAmount = feeTransfer.settledAmount;
        settledDestination = feeTransfer.settledDestination;
      } else {
        const tx = buildActakeEscrowTransaction({
          payerPublicKey: wallet.publicKey,
          recentBlockhash,
          instructionType: 'claim_payout',
          escrowPda: celebrationReceipt.escrowPda,
          escrowWallet: treasuryConfig?.escrowWallet,
          treasuryWallet: treasuryDestination,
          token: celebrationReceipt.token,
          amount: celebrationReceipt.totalEarned,
          metadata: {
            checkinSig: celebrationReceipt.checkinTxSignature.slice(0, 16),
          },
        });

        const claimResult = await signActakeTransaction(tx, wallet);
        claimSignature = claimResult.signature;
        claimConfirmed = claimResult.broadcastedOnChain;
        claimExplorerUrl = claimResult.explorerUrl;
        claimSolscanUrl = claimResult.solscanUrl;
      }

      void fetch(`/api/pools/${encodeURIComponent(celebrationReceipt.stakeId)}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: wallet.publicKey,
          fallbackPrincipal: celebrationReceipt.principalAmount,
          fallbackToken: celebrationReceipt.token,
          txSignature: claimSignature,
          onchainConfirmed: claimConfirmed,
        }),
      }).then(() => {
        void refreshTreasurySummary();
        if (claimConfirmed) {
          void syncDevnet(wallet.publicKey);
        }
      });

      const historyEntry: HistoryEntry = {
        id: `hist-${Date.now()}`,
        dateIso: new Date().toISOString(),
        habitTitle: celebrationReceipt.categoryName,
        verifiedItem: celebrationReceipt.verifiedItemName,
        token: celebrationReceipt.token,
        principal: celebrationReceipt.principalAmount,
        bonus: celebrationReceipt.slashedBonus,
        totalPayout: celebrationReceipt.totalEarned,
        txSignature: claimSignature,
        settledAsset,
        settledAmount,
        settledDestination,
        onchainConfirmed: claimConfirmed,
        explorerUrl: claimExplorerUrl,
        solscanUrl: claimSolscanUrl,
        status: 'claimed',
      };

      updateUserData((prev) => ({
        ...prev,
        stakes: prev.stakes.map((s) =>
          s.id === celebrationReceipt.stakeId ? { ...s, status: 'claimed' } : s
        ),
        earnedUsdcBalance:
          celebrationReceipt.token === 'USDC'
            ? Number((prev.earnedUsdcBalance + celebrationReceipt.totalEarned).toFixed(2))
            : prev.earnedUsdcBalance,
        earnedSkrBalance:
          celebrationReceipt.token === 'SKR'
            ? Number((prev.earnedSkrBalance + celebrationReceipt.totalEarned).toFixed(2))
            : prev.earnedSkrBalance,
        history: [historyEntry, ...prev.history],
      }));

      setCelebrationReceipt((prev) =>
        prev
          ? {
              ...prev,
              claimed: true,
              claimTxSignature: claimSignature,
              claimOnchainConfirmed: claimConfirmed,
              claimExplorerUrl,
            }
          : null
      );
      pushToast(
        'success',
        'Payout Claimed',
        protocolFeeUsd > 0 && settledAsset
          ? `Redeemed $${celebrationReceipt.totalEarned.toFixed(2)} ${celebrationReceipt.token} · 1.5% protocol fee (${settledAsset === 'USDC' ? `$${settledAmount?.toFixed(2)} USDC` : `${settledAmount?.toFixed(4)} SOL`}) sent to Actake Treasury.`
          : `Redeemed $${celebrationReceipt.totalEarned.toFixed(2)} ${celebrationReceipt.token} (0% fee) into your vault.`
      );
    } catch (err) {
      pushToast(
        'error',
        'Claim Settlement Failed',
        err instanceof Error ? err.message : 'Unable to settle payout on Devnet.'
      );
    } finally {
      setClaimingPayout(false);
    }
  };

  // Direct claim helper for verified stakes shown on the Today dashboard
  const handleClaimVerifiedStake = async (stake: StakeCommitment) => {
    if (!wallet || stake.status !== 'verified') return;
    setClaimingStakeId(stake.id);
    try {
      let totalPayout = Number((stake.amount + stake.slashedBonusEstimate).toFixed(2));
      let bonus = stake.slashedBonusEstimate;
      let protocolFeeUsd =
        stake.token === 'USDC'
          ? Number(
              (
                (stake.amount + stake.slashedBonusEstimate) *
                (TOKEN_CONFIGS.USDC.protocolFeePct / 100)
              ).toFixed(4)
            )
          : 0;
      try {
        const settlePoolTarget = stake.poolId || stake.id;
        const quoteResp = await fetch(`/api/pools/${encodeURIComponent(settlePoolTarget)}/settle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userPubkey: wallet.publicKey,
            fallbackPrincipal: stake.amount,
            fallbackToken: stake.token,
          }),
        });
        if (quoteResp.ok) {
          const data = await quoteResp.json();
          if (data?.quote) {
            bonus = Number(data.quote.netSlashedBonus ?? bonus);
            totalPayout = Number(data.quote.totalPayout ?? totalPayout);
            if (typeof data.quote.protocolFee === 'number' && data.quote.protocolFee >= 0) {
              protocolFeeUsd = data.quote.protocolFee;
            }
          }
        }
      } catch {
        // fallback cleanly
      }

      const recentBlockhash = await fetchLatestDevnetBlockhash();
      const treasuryDestination =
        stake.treasuryWallet || treasuryConfig?.treasuryWallet || CONFIGURED_CLIENT_TREASURY_WALLET;

      let claimSignature = '';
      let claimConfirmed = false;
      let claimExplorerUrl: string | undefined;
      let claimSolscanUrl: string | undefined;
      let settledAsset: 'USDC' | 'SOL' | undefined;
      let settledAmount: number | undefined;
      let settledDestination: string | undefined;

      if (stake.token === 'USDC' && protocolFeeUsd > 0 && treasuryDestination) {
        const feeTransfer = await executeDirectOnChainTransfer({
          instructionType: 'claim_payout',
          destination: treasuryDestination,
          token: stake.token,
          usdAmount: protocolFeeUsd,
          escrowPda: stake.escrowPda,
          escrowWallet: stake.escrowWallet || treasuryConfig?.escrowWallet,
          treasuryWallet: treasuryDestination,
          recentBlockhash,
          metadata: {
            protocolFeeUsd,
          },
        });
        claimSignature = feeTransfer.signature;
        claimConfirmed = feeTransfer.broadcastedOnChain;
        claimExplorerUrl = feeTransfer.explorerUrl;
        claimSolscanUrl = feeTransfer.solscanUrl;
        settledAsset = feeTransfer.settledAsset;
        settledAmount = feeTransfer.settledAmount;
        settledDestination = feeTransfer.settledDestination;
      } else {
        const tx = buildActakeEscrowTransaction({
          payerPublicKey: wallet.publicKey,
          recentBlockhash,
          instructionType: 'claim_payout',
          escrowPda: stake.escrowPda,
          escrowWallet: stake.escrowWallet || treasuryConfig?.escrowWallet,
          treasuryWallet: treasuryDestination,
          token: stake.token,
          amount: totalPayout,
        });
        const claimResult = await signActakeTransaction(tx, wallet);
        claimSignature = claimResult.signature;
        claimConfirmed = claimResult.broadcastedOnChain;
        claimExplorerUrl = claimResult.explorerUrl;
        claimSolscanUrl = claimResult.solscanUrl;
      }

      void fetch(`/api/pools/${encodeURIComponent(stake.poolId || stake.id)}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: wallet.publicKey,
          fallbackPrincipal: stake.amount,
          fallbackToken: stake.token,
          txSignature: claimSignature,
          onchainConfirmed: claimConfirmed,
        }),
      }).then(() => {
        void refreshTreasurySummary();
        if (stake.poolId) {
          void refreshPoolTractions(stake.poolId);
        }
      });

      const historyEntry: HistoryEntry = {
        id: `hist-${Date.now()}`,
        dateIso: new Date().toISOString(),
        habitTitle: stake.categoryName,
        verifiedItem: 'Verified Proof Settled',
        token: stake.token,
        principal: stake.amount,
        bonus,
        totalPayout,
        txSignature: claimSignature,
        settledAsset,
        settledAmount,
        settledDestination,
        onchainConfirmed: claimConfirmed,
        explorerUrl: claimExplorerUrl,
        solscanUrl: claimSolscanUrl,
        status: 'claimed',
      };

      updateUserData((prev) => ({
        ...prev,
        stakes: prev.stakes.map((s) => (s.id === stake.id ? { ...s, status: 'claimed' } : s)),
        earnedUsdcBalance:
          stake.token === 'USDC'
            ? Number((prev.earnedUsdcBalance + totalPayout).toFixed(2))
            : prev.earnedUsdcBalance,
        earnedSkrBalance:
          stake.token === 'SKR'
            ? Number((prev.earnedSkrBalance + totalPayout).toFixed(2))
            : prev.earnedSkrBalance,
        history: [historyEntry, ...prev.history],
      }));

      if (claimConfirmed) {
        void syncDevnet(wallet.publicKey);
      }
      pushToast(
        'success',
        'Payout Settled',
        protocolFeeUsd > 0 && settledAsset
          ? `Redeemed $${totalPayout.toFixed(2)} ${stake.token} · 1.5% protocol fee sent on-chain to Actake Treasury.`
          : `Redeemed $${totalPayout.toFixed(2)} ${stake.token} for ${stake.categoryName}.`
      );
    } catch (err) {
      pushToast(
        'error',
        'Payout Settlement Failed',
        err instanceof Error ? err.message : 'Unable to settle verified payout.'
      );
    } finally {
      setClaimingStakeId(null);
    }
  };

  // Settle a missed/forfeited personal commitment: 50% returned to owner, 50% transferred on-chain directly to Actake Fee Treasury
  const handleSlashPersonalStake = async (stake: StakeCommitment) => {
    if (!wallet || stake.status !== 'locked') return;
    setSlashingStakeId(stake.id);
    try {
      const treasuryDestination =
        stake.treasuryWallet || treasuryConfig?.treasuryWallet || CONFIGURED_CLIENT_TREASURY_WALLET;
      if (!treasuryDestination) {
        throw new Error(
          'Set ACTAKE_TREASURY_WALLET (public Solana address) in your environment variables before slashing so the 50% Treasury share transfers on-chain.'
        );
      }

      const treasuryShareUsd = Number((stake.amount * 0.5).toFixed(2));
      const ownerRefundUsd = Number((stake.amount - treasuryShareUsd).toFixed(2));

      const recentBlockhash = await fetchLatestDevnetBlockhash();
      const slashTransfer = await executeDirectOnChainTransfer({
        instructionType: 'slash_personal',
        destination: treasuryDestination,
        token: stake.token,
        usdAmount: treasuryShareUsd,
        escrowPda: stake.escrowPda,
        escrowWallet: stake.escrowWallet || treasuryConfig?.escrowWallet,
        treasuryWallet: treasuryDestination,
        recentBlockhash,
        metadata: {
          routing: '50_owner_50_treasury',
          treasuryShareUsd,
          ownerRefundUsd,
        },
      });

      const resp = await fetch(`/api/pools/${encodeURIComponent(stake.id)}/slash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: wallet.publicKey,
          poolTitle: stake.categoryName,
          stakeAmount: stake.amount,
          tokenSymbol: stake.token,
          txSignature: slashTransfer.signature,
          onchainConfirmed: slashTransfer.broadcastedOnChain,
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to record personal stake slash.');
      }

      const settledLabel =
        slashTransfer.settledAsset === 'USDC'
          ? `$${slashTransfer.settledAmount.toFixed(2)} SPL USDC`
          : `${slashTransfer.settledAmount.toFixed(4)} SOL (~$${treasuryShareUsd.toFixed(2)})`;

      const historyEntry: HistoryEntry = {
        id: `hist-slash-${Date.now()}`,
        dateIso: new Date().toISOString(),
        habitTitle: stake.categoryName,
        verifiedItem: `Missed Stake → 50% Owner ($${ownerRefundUsd.toFixed(2)}) · 50% Treasury (${settledLabel})`,
        token: stake.token,
        principal: stake.amount,
        bonus: 0,
        totalPayout: ownerRefundUsd,
        txSignature: slashTransfer.signature,
        settledAsset: slashTransfer.settledAsset,
        settledAmount: slashTransfer.settledAmount,
        settledDestination: slashTransfer.settledDestination,
        onchainConfirmed: slashTransfer.broadcastedOnChain,
        explorerUrl: slashTransfer.explorerUrl,
        solscanUrl: slashTransfer.solscanUrl,
        status: 'slashed',
      };

      updateUserData((prev) => ({
        ...prev,
        stakes: prev.stakes.map((s) =>
          s.id === stake.id
            ? {
                ...s,
                status: 'slashed',
                slashedTxSignature: slashTransfer.signature,
                settledAsset: slashTransfer.settledAsset,
                settledAmount: slashTransfer.settledAmount,
                settledDestination: slashTransfer.settledDestination,
                solscanUrl: slashTransfer.solscanUrl,
              }
            : s
        ),
        earnedUsdcBalance:
          stake.token === 'USDC'
            ? Number((prev.earnedUsdcBalance + ownerRefundUsd).toFixed(2))
            : prev.earnedUsdcBalance,
        earnedSkrBalance:
          stake.token === 'SKR'
            ? Number((prev.earnedSkrBalance + ownerRefundUsd).toFixed(2))
            : prev.earnedSkrBalance,
        history: [historyEntry, ...prev.history],
      }));

      void refreshGlobalActivity();
      void refreshTreasurySummary();
      if (stake.poolId) {
        void refreshPoolTractions(stake.poolId);
      }
      if (slashTransfer.broadcastedOnChain) {
        void syncDevnet(wallet.publicKey);
      }

      pushToast(
        'info',
        'Forfeited Stake Split 50 / 50',
        `50% (${settledLabel}) transferred on-chain to Actake Fee Treasury · 50% ($${ownerRefundUsd.toFixed(2)} ${stake.token}) returned to owner.`
      );
    } catch (err) {
      pushToast(
        'error',
        'Slash Settlement Failed',
        err instanceof Error ? err.message : 'Unable to settle missed stake.'
      );
    } finally {
      setSlashingStakeId(null);
    }
  };

  // Geo-Hunt proof launch (triggers live camera verification with hunt target)
  const handleLaunchGeoProof = (hunt: GeoHuntZone) => {
    if (!wallet || !userData) return;
    const huntStake: StakeCommitment = {
      id: `hunt-${hunt.id}-${Date.now()}`,
      categoryId: 'outdoors_grass',
      categoryName: hunt.title,
      environmentHint: `${hunt.title} geofence location (${hunt.targetItemHint})`,
      amount: 15,
      token: 'USDC',
      protocolFeePct: 1.5,
      alarmHour: new Date().getHours(),
      alarmMinute: new Date().getMinutes(),
      alarmSound: userData.alarmSettings.selectedSound,
      escrowPda: `ACTKGeoHunt${hunt.id.slice(-6)}PoolPDA`,
      joinTxSignature: `GeoHuntJoin${Date.now()}`,
      recentBlockhash: devnet.blockhash || 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
      createdAt: Date.now(),
      status: 'ringing',
      slashedBonusEstimate: 6.5,
    };

    setRingingStake(huntStake);
    setAlarmMuted(true); // Geo-hunt camera proof doesn't blast alarm audio
    requestChallengeForStake(huntStake);
  };

  // Require wallet connection before previewing or joining a shared pool link/code
  if (!wallet || !userData) {
    return (
      <>
        {bootSplash && (
          <div className="fixed inset-0 z-[70] actake-canvas flex flex-col items-center justify-center p-6 gap-5">
            <BrandMark size="lg" />
            <MascotLoader
              size="2xl"
              theme="light"
              title="Loading Actake..."
              subtitle="Preparing Solana Devnet, Pollar wallet & accountability vault"
            />
          </div>
        )}
        <ActakeLandingPage
          wallets={wallets}
          platform={platform}
          connecting={connectingWallet}
          error={walletError}
          pendingPoolInvite={activeLobbyPoolId}
          onConnect={handleConnectWallet}
        />
        {connectingWallet && (
          <div className="fixed inset-0 z-[65] bg-[#111114]/55 backdrop-blur-xs flex items-center justify-center p-6">
            <div className="w-full max-w-sm rounded-[32px] bg-[#FFF8F4] border border-[#F2E2D8] px-6 py-8 shadow-2xl">
              <MascotLoader
                size="xl"
                theme="light"
                title="Connecting Solana Wallet..."
                subtitle="Approve Sign-In With Solana (SIWS) to unlock your vault"
              />
            </div>
          </div>
        )}
        {pollarModalMode && (
          <PollarModal
            mode={pollarModalMode}
            onFallbackVault={() => void handleConnectWallet('vault:browser-ed25519')}
            onClose={() => setPollarModalMode(null)}
          />
        )}
        <ToastHost toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const allCategories = [...BUILTIN_CATEGORIES, ...userData.customCategories];

  return (
    <div className="min-h-screen actake-canvas text-[#111114] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract: [Brand] — [5 single-line nav links] — [1 primary Wallet CTA] */}
      <header className="sticky top-0 z-30 bg-[#FFF4EE]/92 backdrop-blur-md border-b border-[#F2E2D8]">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => {
              setActiveLobbyPoolId(null);
              setActiveTab('home');
              window.history.pushState({}, '', '/');
            }}
            className="text-left min-h-[44px] flex items-center rounded-xl"
          >
            <BrandMark size="md" />
          </button>

          <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-2 text-sm font-semibold text-[#6B6663]">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = !activeLobbyPoolId && activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveLobbyPoolId(null);
                    setActiveTab(item.id);
                    window.history.pushState({}, '', '/');
                  }}
                  className={`min-h-[44px] px-3.5 py-2 rounded-full inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#FFF0E6] text-[#111114] font-bold'
                      : 'text-[#6B6663] hover:text-[#111114] hover:bg-white/70'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#F16A2E]' : 'text-[#8E8782]'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setWalletSheetOpen(true)}
              className="min-h-[44px] px-4 py-2 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-mono font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              <Wallet className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>{shortenAddress(wallet.publicKey)}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28 md:pb-12">
        {activeLobbyPoolId ? (
          <SquadLobbyView
            poolId={activeLobbyPoolId}
            wallet={wallet}
            isInPersonalAlarms={userData.stakes.some(
              (s) =>
                (s.poolId === activeLobbyPoolId ||
                  (s.inviteCode &&
                    s.inviteCode.toUpperCase() === activeLobbyPoolId.toUpperCase())) &&
                (s.status === 'locked' || s.status === 'verified')
            )}
            onBack={exitSquadLobby}
            onRequestConnectWallet={() => setWalletSheetOpen(true)}
            onLaunchBrowserCheckin={(lobbyStake, poolId) => {
              setRingingPoolId(poolId);
              setRingingStake(lobbyStake);
              setAlarmMuted(true);
              requestChallengeForStake(lobbyStake);
            }}
            onPoolJoined={handlePoolJoined}
            onGoToToday={() => {
              setActiveLobbyPoolId(null);
              setActiveTab('home');
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', '/');
              }
            }}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeView
                nowMs={nowMs}
                walletLabel={shortenAddress(wallet.publicKey, 4)}
                walletAddress={wallet.publicKey}
                connectionKind={wallet.connectionKind}
                categories={allCategories}
                stakes={userData.stakes}
                history={userData.history}
                streakDays={userData.streakDays}
                earnedUsdcBalance={userData.earnedUsdcBalance}
                earnedSkrBalance={userData.earnedSkrBalance}
                actPoints={userData.actPoints}
                alarmSettings={userData.alarmSettings}
                devnet={devnet}
                globalActivity={globalActivity}
                globalActivityLoading={globalActivityLoading}
                globalActivityError={globalActivityError}
                tractionByPoolId={tractionByPoolId}
                onRetryGlobalActivity={() => void refreshGlobalActivity()}
                onRefreshDevnet={() => void syncDevnet(wallet.publicKey, true)}
                onOpenMissions={() => setActiveTab('missions')}
                onOpenAlarmSettings={() => setAlarmSettingsOpen(true)}
                onOpenPollarFund={handleOpenPollarFund}
                onOpenWalletSheet={() => setWalletSheetOpen(true)}
                onTriggerTestAlarm={triggerAlarmForStake}
                onOpenSquadLobby={navigateToSquadLobby}
                onQuickCreateStake={handleCreateStake}
                submittingStake={submittingStake}
                onClaimVerifiedStake={handleClaimVerifiedStake}
                claimingStakeId={claimingStakeId}
                onSlashPersonalStake={handleSlashPersonalStake}
                slashingStakeId={slashingStakeId}
                treasuryConfig={treasuryConfig}
              />
            )}

            {activeTab === 'missions' && (
              <MissionsView
                wallet={wallet}
                categories={allCategories}
                defaultAlarmSound={userData.alarmSettings.selectedSound}
                submitting={submittingStake}
                initialPreset={pendingExplorePreset}
                treasuryConfig={treasuryConfig}
                onClearPreset={handleClearPendingExplorePreset}
                onAddCustomCategory={(cat) =>
                  updateUserData((prev) => ({
                    ...prev,
                    customCategories: [...prev.customCategories, cat],
                  }))
                }
                onOpenPollarFund={handleOpenPollarFund}
                onSignInPollar={() => void handleConnectWallet('pollar:connect')}
                onCreateStake={handleCreateStake}
                onNavigateTab={(t) => setActiveTab(t)}
              />
            )}

            {activeTab === 'hunts' && <HuntsView onLaunchGeoProof={handleLaunchGeoProof} />}

            {activeTab === 'squads' && (
              <SquadsView
                squads={userData.squads}
                onOpenSquadLobby={navigateToSquadLobby}
                onSelectTemplateToStake={(preset) => {
                  setPendingExplorePreset(preset);
                  setActiveTab('missions');
                }}
                onToggleReaction={(squadId, feedId, kind) =>
                  updateUserData((prev) => ({
                    ...prev,
                    squads: prev.squads.map((sq) => {
                      if (sq.id !== squadId) return sq;
                      return {
                        ...sq,
                        feed: sq.feed.map((f) => {
                          if (f.id !== feedId) return f;
                          if (kind === 'like') {
                            const liked = !f.userLiked;
                            return { ...f, userLiked: liked, likes: f.likes + (liked ? 1 : -1) };
                          }
                          const fired = !f.userFired;
                          return { ...f, userFired: fired, fires: f.fires + (fired ? 1 : -1) };
                        }),
                      };
                    }),
                  }))
                }
                onCreateSquad={(squad: SquadPool) => {
                  updateUserData((prev) => ({
                    ...prev,
                    squads: [squad, ...prev.squads],
                  }));
                  pushToast(
                    'success',
                    'Community Pool Created',
                    `${squad.name} · $${squad.stakeAmount} ${squad.token} accountability pool is live.`
                  );
                  void fetch('/api/pools', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: squad.id,
                      inviteCode: squad.inviteCode,
                      title: squad.name,
                      creatorPubkey: wallet.publicKey,
                      tokenSymbol: squad.token,
                      poolType: 1,
                      stakeAmount: squad.stakeAmount,
                      alarmHour: squad.alarmHour ?? 7,
                      alarmMinute: squad.alarmMinute ?? 0,
                    }),
                  }).then(() => refreshGlobalActivity());
                }}
              />
            )}

            {activeTab === 'history' && (
              <HistoryView
                history={userData.history}
                stakes={userData.stakes}
                streakDays={userData.streakDays}
                solPriceUsd={devnet.solPriceUsd}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                wallet={wallet}
                stakes={userData.stakes}
                alarmSettings={userData.alarmSettings}
                streakDays={userData.streakDays}
                actPoints={userData.actPoints}
                treasurySummary={treasurySummary}
                treasurySummaryLoading={treasurySummaryLoading}
                treasurySummaryError={treasurySummaryError}
                onRefreshTreasurySummary={() => void refreshTreasurySummary()}
                onOpenWalletSheet={() => setWalletSheetOpen(true)}
                onOpenReadinessDrawer={() => setReadinessDrawerOpen(true)}
                onOpenAlarmSettings={() => setAlarmSettingsOpen(true)}
                onOpenCreateStake={() => setActiveTab('missions')}
                onTriggerTestAlarm={triggerAlarmForStake}
                onDisconnectWallet={handleDisconnect}
              />
            )}
          </>
        )}
      </main>

      {/* Signature Floating Black & Orange Capsule Mobile Navigation Bar */}
      <nav
        aria-label="Primary Mobile Navigation"
        className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-40 max-w-[94vw]"
      >
        <div className="flex items-center gap-2 rounded-full bg-[#111114] p-1.5 shadow-[0_14px_34px_rgba(17,17,20,0.34)]">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = !activeLobbyPoolId && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                onClick={() => {
                  setActiveLobbyPoolId(null);
                  setActiveTab(item.id);
                  window.history.pushState({}, '', '/');
                }}
                className={`min-h-[44px] rounded-full flex items-center justify-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#F16A2E] text-white px-4 font-bold text-xs shadow-sm'
                    : 'bg-white text-[#111114] w-11 h-11 hover:bg-[#FFF4EE]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {active && <span>{item.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Non-Dismissible Ringing Alarm Challenge Pop-Up */}
      {ringingStake && !inLiveCamera && (
        <AlarmChallengeModal
          stake={ringingStake}
          challenge={activeChallenge}
          loading={challengeLoading}
          error={challengeError}
          muted={alarmMuted}
          onToggleMute={handleToggleMute}
          onRetryGenerate={() => requestChallengeForStake(ringingStake)}
          onProceedToCamera={() => setInLiveCamera(true)}
        />
      )}

      {/* Live Camera Verification Screen locked onto displayed item */}
      {ringingStake && activeChallenge && inLiveCamera && (
        <LiveCameraVerifyView
          stake={ringingStake}
          challenge={activeChallenge}
          walletPublicKey={wallet.publicKey}
          poolId={ringingPoolId}
          strictMode={userData.alarmSettings.strictMode}
          muted={alarmMuted}
          onToggleMute={handleToggleMute}
          onExit={() => {
            alarmAudio.stop();
            setInLiveCamera(false);
            setRingingStake(null);
            setRingingPoolId(undefined);
            setActiveChallenge(null);
          }}
          onVerified={handleVerificationPassed}
        />
      )}

      {/* Emerald Celebration & Payout Claim Screen */}
      {celebrationReceipt && (
        <CelebrationView
          receipt={celebrationReceipt}
          claiming={claimingPayout}
          onClaimPayout={handleClaimPayout}
          onDone={() => setCelebrationReceipt(null)}
        />
      )}

      {/* Loud Alarm Sound & Strictness Settings Modal */}
      {alarmSettingsOpen && (
        <AlarmSettingsModal
          settings={userData.alarmSettings}
          onChange={(next: AlarmSettings) => {
            updateUserData((prev) => ({ ...prev, alarmSettings: next }));
            pushToast('success', 'Alarm Preferences Updated', 'Your sound and strictness settings are saved.');
          }}
          onClose={() => setAlarmSettingsOpen(false)}
        />
      )}

      {/* Solana Wallet Inspector & Cross-Platform Switcher Sheet */}
      {walletSheetOpen && (
        <WalletSheet
          wallet={wallet}
          wallets={wallets}
          platform={platform}
          devnet={devnet}
          onRefreshDevnet={() => void syncDevnet(wallet.publicKey, true)}
          onOpenPollarFund={handleOpenPollarFund}
          onSwitchWallet={handleConnectWallet}
          onDisconnect={handleDisconnect}
          onClose={() => setWalletSheetOpen(false)}
        />
      )}

      {/* Devnet Setup, Oracle Public Key & Anchor Escrow Diagnostics Drawer */}
      {readinessDrawerOpen && (
        <ReadinessDrawer
          wallet={wallet}
          platform={platform}
          devnet={devnet}
          onRefreshDevnet={() => syncDevnet(wallet.publicKey)}
          onClose={() => setReadinessDrawerOpen(false)}
        />
      )}

      {/* Pollar Protocol Hub (Sign-In, Fiat On-Ramp Funding, Receive QR, Balances & Setup) */}
      {pollarModalMode && (
        <PollarModal
          mode={pollarModalMode}
          onFallbackVault={() => void handleConnectWallet('vault:browser-ed25519')}
          onClose={() => setPollarModalMode(null)}
        />
      )}

      {/* Branded Initial Boot Splash */}
      {bootSplash && (
        <div className="fixed inset-0 z-[70] actake-canvas flex flex-col items-center justify-center p-6 gap-5">
          <BrandMark size="lg" />
          <MascotLoader
            size="2xl"
            theme="light"
            title="Loading Actake..."
            subtitle="Syncing Solana Devnet, Pollar wallet & accountability vault"
          />
        </div>
      )}

      {/* Non-Blocking Background Stake Transaction Progress Indicator (never covers wallet/Pollar modals) */}
      {submittingStake && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 right-4 z-30 pointer-events-none max-w-[calc(100vw-2rem)]"
        >
          <div className="rounded-2xl bg-[#141416]/95 text-white border border-white/12 px-4 py-3 shadow-lg flex items-center gap-3 backdrop-blur-xs">
            <Loader2 className="w-4 h-4 animate-spin text-[#F16A2E] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold leading-tight">
                Processing Stake Transaction...
              </div>
              <div className="text-[11px] text-white/70 leading-tight mt-0.5">
                Confirm in your wallet or Pollar prompt
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Wallet Connection Loader Overlay (non-blocking during stake submission so wallet/Pollar modals stay visible) */}
      {connectingWallet && (
        <div className="fixed inset-0 z-[65] bg-[#111114]/55 backdrop-blur-xs flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-[32px] bg-[#FFF8F4] border border-[#F2E2D8] px-6 py-8 shadow-2xl">
            <MascotLoader
              size="xl"
              theme="light"
              title="Connecting Solana Wallet..."
              subtitle="Approve your wallet signature to continue"
            />
          </div>
        </div>
      )}

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
