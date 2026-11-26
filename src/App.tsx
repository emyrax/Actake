import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
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
  RandomizedTargetPrompt,
  SquadPool,
  StakeCommitment,
  TokenType,
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
  buildDevnetExplorerTxUrl,
  buildSquadBlinkUrl,
  deriveEscrowPoolPda,
  fetchDevnetTelemetry,
  fetchLatestDevnetBlockhash,
  TOKEN_CONFIGS,
} from './solana/actakeEscrow';
import {
  buildPollarSolanaPaymentParams,
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
import { BrandMark } from './components/BrandMark';
import { OnboardingView } from './components/OnboardingView';
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
import { SquadLobbyView } from './components/SquadLobbyView';
import { EscrowVault3D } from './components/EscrowVault3D';
import { ReadinessDrawer } from './components/ReadinessDrawer';

function readPoolIdFromPathname(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/squad\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
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
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [pendingExplorePreset, setPendingExplorePreset] = useState<ExploreHabitPreset | null>(null);
  const [activeLobbyPoolId, setActiveLobbyPoolId] = useState<string | null>(() =>
    readPoolIdFromPathname()
  );
  const [globalActivity, setGlobalActivity] = useState<GlobalActivitySummary | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [userData, setUserData] = useState<PersistedUserData | null>(() =>
    wallet ? loadUserData(wallet.publicKey) : null
  );

  // Solana Devnet telemetry
  const [devnet, setDevnet] = useState<DevnetSyncState>({
    slot: null,
    solBalance: null,
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
  const [vaultExpandedOpen, setVaultExpandedOpen] = useState(false);
  const [claimingStakeId, setClaimingStakeId] = useState<string | null>(null);
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

  // Sync browser back/forward navigation for /squad/:poolId URLs
  useEffect(() => {
    const onPopState = () => {
      setActiveLobbyPoolId(readPoolIdFromPathname());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refreshGlobalActivity = useCallback(async () => {
    try {
      const resp = await fetch('/api/activity/live');
      if (resp.ok) {
        const data = (await resp.json()) as GlobalActivitySummary;
        setGlobalActivity(data);
      }
    } catch {
      // ignore transient network errors
    }
  }, []);

  useEffect(() => {
    refreshGlobalActivity();
  }, [refreshGlobalActivity]);

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

  // Live 1-second clock ticker
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Sync live Solana Devnet slot & SOL balance
  const syncDevnet = useCallback(async (pubkey?: string) => {
    setDevnet((prev) => ({ ...prev, syncing: true, error: null }));
    try {
      const result = await fetchDevnetTelemetry(pubkey);
      setDevnet({
        slot: result.slot,
        solBalance: result.solBalance,
        blockhash: result.blockhash,
        lastSyncedAt: Date.now(),
        syncing: false,
        error: null,
      });
    } catch (err) {
      setDevnet((prev) => ({
        ...prev,
        syncing: false,
        error: err instanceof Error ? err.message : 'Devnet sync failed',
      }));
    }
  }, []);

  useEffect(() => {
    if (wallet) {
      syncDevnet(wallet.publicKey);
    }
  }, [wallet?.publicKey, syncDevnet]);

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

        const resp = await fetch('/api/ai/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: stake.categoryId,
            categoryName: stake.categoryName,
            environmentHint: stake.environmentHint,
            recentItems: combinedRecent,
          }),
        });

        const payload = await resp.json();
        if (!resp.ok) {
          throw new Error(payload.error || 'Failed to generate AI verification challenge.');
        }

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
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Wallet connection canceled or failed.');
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
  };

  // Fund or withdraw available Actake vault balance
  const handleAdjustVaultBalance = (kind: 'fund' | 'withdraw', amount: number, token: TokenType) => {
    updateUserData((prev) => {
      const delta = kind === 'fund' ? amount : -amount;
      if (token === 'USDC') {
        return {
          ...prev,
          earnedUsdcBalance: Math.max(0, Number((prev.earnedUsdcBalance + delta).toFixed(2))),
        };
      }
      return {
        ...prev,
        earnedSkrBalance: Math.max(0, Number((prev.earnedSkrBalance + delta).toFixed(2))),
      };
    });
  };

  // Create stake via actake_escrow::join_pool bound to live Solana Devnet blockhash
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

      let signature = '';
      let broadcastedOnChain = false;
      let explorerUrl: string | undefined;
      let paidVia: 'pollar' | 'solana-tx' = 'solana-tx';

      if (wallet.connectionKind === 'pollar' && pollar.configured && pollar.isAuthenticated) {
        const paymentParams = buildPollarSolanaPaymentParams({
          destination: escrowPda,
          amount: params.amount,
          token: params.token,
        });
        const outcome = await pollar.sendPayment(paymentParams);
        if (outcome.status === 'success' || outcome.status === 'pending') {
          signature = outcome.hash;
          broadcastedOnChain = true;
          explorerUrl = buildDevnetExplorerTxUrl(outcome.hash);
          paidVia = 'pollar';
          void pollar.refreshWalletBalance();
        } else if (outcome.status === 'cosign_pending') {
          signature = `pollar-cosign-${outcome.request.id}`;
          broadcastedOnChain = false;
          paidVia = 'pollar';
        } else {
          throw new Error(
            outcome.message ||
              outcome.details ||
              'Pollar payment failed. Fund your Pollar Solana wallet and try again.'
          );
        }
      } else {
        const tx = buildActakeEscrowTransaction({
          payerPublicKey: wallet.publicKey,
          recentBlockhash,
          instructionType: 'join_pool',
          escrowPda,
          token: params.token,
          amount: params.amount,
          metadata: {
            categoryId: params.category.id,
            alarm: `${String(params.alarmHour).padStart(2, '0')}:${String(params.alarmMinute).padStart(2, '0')}`,
          },
        });

        const txResult = await signActakeTransaction(tx, wallet);
        signature = txResult.signature;
        broadcastedOnChain = txResult.broadcastedOnChain;
        explorerUrl = txResult.explorerUrl;
      }

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
        joinTxSignature: signature,
        paidVia,
        onchainConfirmed: broadcastedOnChain,
        explorerUrl,
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
          joinedTxSignature: signature,
        }),
      }).then(() => {
        void refreshGlobalActivity();
        if (broadcastedOnChain) {
          void syncDevnet(wallet.publicKey);
        }
      });

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
      const quoteResp = await fetch(
        `/api/pools/${encodeURIComponent(ringingPoolId || ringingStake.id)}/settle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userPubkey: wallet.publicKey,
            fallbackPrincipal: ringingStake.amount,
            fallbackToken: ringingStake.token,
          }),
        }
      );
      if (quoteResp.ok) {
        const quoteData = await quoteResp.json();
        if (quoteData?.quote) {
          principalAmount = Number(quoteData.quote.principalAmount ?? principalAmount);
          slashedBonus = Number(quoteData.quote.netSlashedBonus ?? slashedBonus);
          totalEarned = Number(quoteData.quote.totalPayout ?? totalEarned);
        }
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
  };

  // Sign & broadcast actake_escrow::claim_payout on Celebration screen & record in History Ledger + Supabase
  const handleClaimPayout = async () => {
    if (!wallet || !celebrationReceipt || celebrationReceipt.claimed) return;
    setClaimingPayout(true);
    try {
      const recentBlockhash = await fetchLatestDevnetBlockhash();
      const tx = buildActakeEscrowTransaction({
        payerPublicKey: wallet.publicKey,
        recentBlockhash,
        instructionType: 'claim_payout',
        escrowPda: celebrationReceipt.escrowPda,
        token: celebrationReceipt.token,
        amount: celebrationReceipt.totalEarned,
        metadata: {
          checkinSig: celebrationReceipt.checkinTxSignature.slice(0, 16),
        },
      });

      const claimResult = await signActakeTransaction(tx, wallet);

      void fetch(`/api/pools/${encodeURIComponent(celebrationReceipt.stakeId)}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: wallet.publicKey,
          fallbackPrincipal: celebrationReceipt.principalAmount,
          fallbackToken: celebrationReceipt.token,
          txSignature: claimResult.signature,
          onchainConfirmed: claimResult.broadcastedOnChain,
        }),
      }).then(() => {
        if (claimResult.broadcastedOnChain) {
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
        txSignature: claimResult.signature,
        onchainConfirmed: claimResult.broadcastedOnChain,
        explorerUrl: claimResult.explorerUrl,
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
              claimTxSignature: claimResult.signature,
              claimOnchainConfirmed: claimResult.broadcastedOnChain,
              claimExplorerUrl: claimResult.explorerUrl,
            }
          : null
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
      try {
        const quoteResp = await fetch(`/api/pools/${encodeURIComponent(stake.id)}/settle`, {
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
          }
        }
      } catch {
        // fallback cleanly
      }

      const recentBlockhash = await fetchLatestDevnetBlockhash();
      const tx = buildActakeEscrowTransaction({
        payerPublicKey: wallet.publicKey,
        recentBlockhash,
        instructionType: 'claim_payout',
        escrowPda: stake.escrowPda,
        token: stake.token,
        amount: totalPayout,
      });
      const claimResult = await signActakeTransaction(tx, wallet);

      void fetch(`/api/pools/${encodeURIComponent(stake.id)}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: wallet.publicKey,
          fallbackPrincipal: stake.amount,
          fallbackToken: stake.token,
          txSignature: claimResult.signature,
          onchainConfirmed: claimResult.broadcastedOnChain,
        }),
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
        txSignature: claimResult.signature,
        onchainConfirmed: claimResult.broadcastedOnChain,
        explorerUrl: claimResult.explorerUrl,
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

      if (claimResult.broadcastedOnChain) {
        void syncDevnet(wallet.publicKey);
      }
    } finally {
      setClaimingStakeId(null);
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

  // Allow viewing a shared /squad/:poolId web lobby even before wallet connect
  if (!wallet || !userData) {
    if (activeLobbyPoolId) {
      return (
        <div className="min-h-screen actake-canvas text-[#111114] flex flex-col">
          <header className="sticky top-0 z-30 bg-[#FFF4EE]/90 backdrop-blur-md border-b border-[#F2E2D8]">
            <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
              <button type="button" onClick={exitSquadLobby} className="text-left">
                <BrandMark size="md" />
              </button>
              <button
                type="button"
                onClick={() => handleConnectWallet('pollar:connect')}
                className="min-h-[40px] px-4 py-2 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-semibold whitespace-nowrap transition-colors"
              >
                Sign In with Pollar
              </button>
            </div>
          </header>
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
            <SquadLobbyView
              poolId={activeLobbyPoolId}
              wallet={null}
              onBack={exitSquadLobby}
              onRequestConnectWallet={() => handleConnectWallet('pollar:connect')}
              onLaunchBrowserCheckin={() => handleConnectWallet('pollar:connect')}
            />
          </main>
          {pollarModalMode && (
            <PollarModal
              mode={pollarModalMode}
              onFallbackVault={() => void handleConnectWallet('vault:browser-ed25519')}
              onClose={() => setPollarModalMode(null)}
            />
          )}
        </div>
      );
    }

    return (
      <>
        <OnboardingView
          wallets={wallets}
          platform={platform}
          connecting={connectingWallet}
          error={walletError}
          onConnect={handleConnectWallet}
        />
        {pollarModalMode && (
          <PollarModal
            mode={pollarModalMode}
            onFallbackVault={() => void handleConnectWallet('vault:browser-ed25519')}
            onClose={() => setPollarModalMode(null)}
          />
        )}
      </>
    );
  }

  const allCategories = [...BUILTIN_CATEGORIES, ...userData.customCategories];
  const activeLockedTotal = userData.stakes
    .filter((s) => s.status === 'locked' || s.status === 'ringing')
    .reduce((sum, s) => sum + s.amount, 0);
  const activeLockedCount = userData.stakes.filter(
    (s) => s.status === 'locked' || s.status === 'ringing'
  ).length;

  return (
    <div className="min-h-screen actake-canvas text-[#111114] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract: [Brand] — [5 single-line nav links] — [1 primary Wallet CTA] */}
      <header className="sticky top-0 z-30 bg-[#FFF4EE]/90 backdrop-blur-md border-b border-[#F2E2D8]">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              setActiveLobbyPoolId(null);
              setActiveTab('home');
              window.history.pushState({}, '', '/');
            }}
            className="text-left focus-visible:outline-none"
          >
            <BrandMark size="md" />
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-[#6B6663]">
            {NAV_ITEMS.map((item) => {
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
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    active
                      ? 'text-[#111114] border-[#F16A2E]'
                      : 'border-transparent hover:text-[#111114]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setWalletSheetOpen(true)}
              className="min-h-[40px] px-4 py-2 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-mono font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
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
            onBack={exitSquadLobby}
            onRequestConnectWallet={() => setWalletSheetOpen(true)}
            onLaunchBrowserCheckin={(lobbyStake, poolId) => {
              setRingingPoolId(poolId);
              setRingingStake(lobbyStake);
              setAlarmMuted(true);
              requestChallengeForStake(lobbyStake);
            }}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeView
                nowMs={nowMs}
                walletLabel={shortenAddress(wallet.publicKey, 4)}
                connectionKind={wallet.connectionKind}
                stakes={userData.stakes}
                streakDays={userData.streakDays}
                earnedUsdcBalance={userData.earnedUsdcBalance}
                earnedSkrBalance={userData.earnedSkrBalance}
                actPoints={userData.actPoints}
                alarmSettings={userData.alarmSettings}
                devnet={devnet}
                globalActivity={globalActivity}
                onRefreshDevnet={() => syncDevnet(wallet.publicKey)}
                onOpenMissions={() => setActiveTab('missions')}
                onOpenAlarmSettings={() => setAlarmSettingsOpen(true)}
                onOpenPollarFund={handleOpenPollarFund}
                onTriggerTestAlarm={triggerAlarmForStake}
                onExpandVault3D={() => setVaultExpandedOpen(true)}
                onOpenSquadLobby={navigateToSquadLobby}
                onAdjustVaultBalance={handleAdjustVaultBalance}
                onClaimVerifiedStake={handleClaimVerifiedStake}
                claimingStakeId={claimingStakeId}
              />
            )}

            {activeTab === 'missions' && (
              <MissionsView
                wallet={wallet}
                categories={allCategories}
                defaultAlarmSound={userData.alarmSettings.selectedSound}
                submitting={submittingStake}
                initialPreset={pendingExplorePreset}
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
                  void fetch('/api/pools', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: squad.id,
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
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                wallet={wallet}
                stakes={userData.stakes}
                alarmSettings={userData.alarmSettings}
                streakDays={userData.streakDays}
                actPoints={userData.actPoints}
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

      {/* Fullscreen 3D Escrow Vault Inspector Modal */}
      {vaultExpandedOpen && (
        <div className="fixed inset-0 z-50 bg-[#FFF4EE]">
          <EscrowVault3D
            vaultState={ringingStake ? 'ringing' : celebrationReceipt ? 'verified' : 'locked'}
            totalLockedUsd={activeLockedTotal}
            activeStakesCount={activeLockedCount}
            expanded
            onToggleExpand={() => setVaultExpandedOpen(false)}
            className="w-screen h-screen rounded-none border-0"
          />
        </div>
      )}

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
          onChange={(next: AlarmSettings) =>
            updateUserData((prev) => ({ ...prev, alarmSettings: next }))
          }
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
          onRefreshDevnet={() => syncDevnet(wallet.publicKey)}
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
    </div>
  );
}
