import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Crown,
  Flame,
  Info,
  Link2,
  Loader2,
  Share2,
  ShieldCheck,
  ThumbsUp,
  Trophy,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  LiveCheckinRecord,
  PoolTractionSummary,
  StakeCommitment,
  TokenType,
  WalletSession,
} from '../types/actake';
import {
  buildActakeEscrowTransaction,
  buildSquadBlinkUrl,
  buildSquadLobbyUrl,
  fetchLatestDevnetBlockhash,
} from '../solana/actakeEscrow';
import { shortenAddress, signActakeTransaction } from '../solana/walletManager';
import { derivePoolInviteCode } from '../utils/poolLinks';
import { MascotDisplay } from './MascotDisplay';
import { EmptyState, ErrorStateCard, LobbyLayoutSkeleton } from './UiPrimitives';

export interface LobbyPool {
  id: string;
  inviteCode?: string;
  poolPubkey: string;
  title: string;
  categoryId: string;
  environmentHint: string;
  tokenSymbol: TokenType;
  stakeAmount: number;
  totalDays: number;
  alarmHour: number;
  alarmMinute: number;
  totalStaked: number;
  participantCount: number;
  totalSuccessfulCheckins: number;
  slashedPotAvailable: number;
}

interface LobbyParticipant {
  id: string;
  userPubkey: string;
  displayName: string;
  stakedAmount: number;
  checkinsCompleted: number;
  streakDays: number;
  isSlashed: boolean;
}

interface SquadLobbyViewProps {
  poolId: string;
  wallet: WalletSession | null;
  isInPersonalAlarms?: boolean;
  onBack: () => void;
  onRequestConnectWallet: () => void;
  onLaunchBrowserCheckin: (stake: StakeCommitment, poolId: string) => void;
  onPoolJoined?: (payload: {
    pool: LobbyPool;
    traction?: PoolTractionSummary;
    txSignature: string;
    broadcastedOnChain: boolean;
    explorerUrl?: string;
    solscanUrl?: string;
  }) => void;
  onGoToToday?: () => void;
}

function formatAlarm12h(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}

export const SquadLobbyView: React.FC<SquadLobbyViewProps> = ({
  poolId,
  wallet,
  isInPersonalAlarms = false,
  onBack,
  onRequestConnectWallet,
  onLaunchBrowserCheckin,
  onPoolJoined,
  onGoToToday,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState<LobbyPool | null>(null);
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [checkins, setCheckins] = useState<LiveCheckinRecord[]>([]);
  const [traction, setTraction] = useState<PoolTractionSummary | null>(null);

  const [joining, setJoining] = useState(false);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'slashed'>('all');

  useEffect(() => {
    setAboutExpanded(false);
  }, [poolId]);

  const rankedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.isSlashed !== b.isSlashed) return a.isSlashed ? 1 : -1;
      if (b.checkinsCompleted !== a.checkinsCompleted) {
        return b.checkinsCompleted - a.checkinsCompleted;
      }
      if (b.streakDays !== a.streakDays) return b.streakDays - a.streakDays;
      return b.stakedAmount - a.stakedAmount;
    });
  }, [participants]);

  const activeLeaderboardCount = rankedParticipants.filter((p) => !p.isSlashed).length;
  const slashedLeaderboardCount = rankedParticipants.filter((p) => p.isSlashed).length;

  const filteredParticipants = useMemo(() => {
    if (statusFilter === 'verified') return rankedParticipants.filter((p) => !p.isSlashed);
    if (statusFilter === 'slashed') return rankedParticipants.filter((p) => p.isSlashed);
    return rankedParticipants;
  }, [rankedParticipants, statusFilter]);

  const loadLobby = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lobbyResp = await fetch(`/api/pools/${encodeURIComponent(poolId)}`);
      if (!lobbyResp.ok) {
        throw new Error('This squad pool could not be found.');
      }
      const data = await lobbyResp.json();
      setPool(data.pool);
      setParticipants(data.participants || []);
      setCheckins(data.checkins || []);
      setTraction(data.traction || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load squad lobby.');
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    void loadLobby();
  }, [loadLobby]);

  const alreadyJoined = Boolean(
    isInPersonalAlarms || (wallet && participants.some((p) => p.userPubkey === wallet.publicKey))
  );

  const handleMatchAndJoin = async () => {
    if (!pool) return;
    if (!wallet) {
      onRequestConnectWallet();
      return;
    }
    setJoining(true);
    setJoinNotice(null);
    setError(null);
    try {
      const recentBlockhash = await fetchLatestDevnetBlockhash();
      const tx = buildActakeEscrowTransaction({
        payerPublicKey: wallet.publicKey,
        recentBlockhash,
        instructionType: 'join_pool',
        escrowPda: pool.poolPubkey,
        token: pool.tokenSymbol,
        amount: pool.stakeAmount,
        metadata: { poolId: pool.id, source: 'web-squad-lobby' },
      });
      const signResult = await signActakeTransaction(tx, wallet);
      const { signature, broadcastedOnChain, explorerUrl, solscanUrl } = signResult;

      const resp = await fetch(`/api/pools/${encodeURIComponent(pool.id)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: wallet.publicKey,
          displayName: shortenAddress(wallet.publicKey, 4),
          joinedTxSignature: signature,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to record pool join.');
      }
      const joinData = await resp.json();
      const resolvedPool: LobbyPool = joinData.pool || pool;
      onPoolJoined?.({
        pool: resolvedPool,
        traction: joinData.traction || traction || undefined,
        txSignature: signature,
        broadcastedOnChain,
        explorerUrl,
        solscanUrl,
      });
      setJoinNotice(
        `Matched $${resolvedPool.stakeAmount} ${resolvedPool.tokenSymbol} & added "${resolvedPool.title}" to your personal alarms.`
      );
      await loadLobby();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join squad pool.');
    } finally {
      setJoining(false);
    }
  };

  const handleSharePool = async () => {
    if (!pool) return;
    const alarmLabel = formatAlarm12h(pool.alarmHour, pool.alarmMinute);
    const shareUrl = buildSquadBlinkUrl({
      poolId: pool.id,
      squadName: pool.title,
      amount: pool.stakeAmount,
      token: pool.tokenSymbol,
      alarmTime: alarmLabel,
    });
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join ${pool.title} on Actake`,
          text: `Stake $${pool.stakeAmount} ${pool.tokenSymbol} for ${alarmLabel} daily proof:`,
          url: shareUrl,
        });
        return;
      }
    } catch {
      // fallback to clipboard
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleReact = async (checkinId: string, kind: 'like' | 'fire') => {
    try {
      const resp = await fetch(`/api/checkins/${encodeURIComponent(checkinId)}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      if (!resp.ok) return;
      const counts = await resp.json();
      setCheckins((prev) =>
        prev.map((c) =>
          c.id === checkinId ? { ...c, likes: counts.likes, fires: counts.fires } : c
        )
      );
    } catch {
      // ignore
    }
  };

  const handleStartWebcamProof = () => {
    if (!pool) return;
    if (!wallet) {
      onRequestConnectWallet();
      return;
    }
    const lobbyStake: StakeCommitment = {
      id: `lobby-${pool.id}-${Date.now()}`,
      categoryId: pool.categoryId || 'morning_wakeup',
      categoryName: pool.title,
      environmentHint: pool.environmentHint,
      amount: pool.stakeAmount,
      token: pool.tokenSymbol,
      protocolFeePct: pool.tokenSymbol === 'SKR' ? 0 : 1.5,
      alarmHour: pool.alarmHour,
      alarmMinute: pool.alarmMinute,
      alarmSound: 'siren',
      escrowPda: pool.poolPubkey,
      joinTxSignature: `LobbyJoin${Date.now()}`,
      recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
      createdAt: Date.now(),
      status: 'ringing',
      squadName: pool.title,
      slashedBonusEstimate: Number((pool.stakeAmount * 0.25).toFixed(2)),
    };
    onLaunchBrowserCheckin(lobbyStake, pool.id);
  };

  if (loading) {
    return <LobbyLayoutSkeleton />;
  }

  if (!pool) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-4 py-2 rounded-full bg-white border border-[#EFE2D9] text-xs font-bold text-[#111114] hover:bg-[#FFF9F5] inline-flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Explore</span>
        </button>
        {error && (
          <ErrorStateCard
            title="Could not load squad lobby"
            message={error}
            onRetry={() => void loadLobby()}
            retryLabel="Retry Lobby"
          />
        )}
        <EmptyState
          showMascot
          title="Squad Pool Not Found"
          description="This pool link may have expired or does not exist on Devnet yet."
          ctaLabel="Return to Community Pools"
          onCta={onBack}
        />
      </div>
    );
  }

  const deadlineLabel = formatAlarm12h(pool.alarmHour, pool.alarmMinute);
  const inviteCode = pool.inviteCode || derivePoolInviteCode(pool.id, pool.title);
  const directLobbyLink = buildSquadLobbyUrl(pool.id);

  const verifiedTractionCount =
    traction?.verifiedCount ??
    participants.filter((p) => !p.isSlashed && p.checkinsCompleted > 0).length;
  const activeTractionCount =
    traction?.activeCount ??
    participants.filter((p) => !p.isSlashed && p.checkinsCompleted === 0).length;
  const slashedTractionCount =
    traction?.slashedCount ?? participants.filter((p) => p.isSlashed).length;
  const totalTractionMembers =
    traction?.totalMembers ?? Math.max(pool.participantCount, participants.length);
  const verifiedPctToday =
    traction?.checkedInPct ??
    (participants.length > 0
      ? Math.min(100, Math.round((verifiedTractionCount / participants.length) * 100))
      : 0);

  const handleCopyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyDirectLink = async () => {
    try {
      await navigator.clipboard.writeText(directLobbyLink);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Top Navigation Row with Invite Code, Link Copy & Blink Share */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-4 py-2 rounded-full bg-white border border-[#EFE2D9] text-xs font-bold text-[#111114] hover:bg-[#FFF9F5] inline-flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Explore</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopyInviteCode()}
            className="min-h-[44px] px-3.5 py-2 rounded-full bg-white border border-[#EFE2D9] hover:border-[#F16A2E]/60 hover:bg-[#FFF9F5] text-xs font-mono font-bold text-[#111114] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            {copiedCode ? (
              <Check className="w-3.5 h-3.5 text-[#16A34A]" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[#F16A2E]" />
            )}
            <span>{copiedCode ? 'Code Copied' : `Code: ${inviteCode}`}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyDirectLink()}
            className="min-h-[44px] px-3.5 py-2 rounded-full bg-white border border-[#EFE2D9] hover:border-[#F16A2E]/60 hover:bg-[#FFF9F5] text-xs font-bold text-[#111114] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-[#16A34A]" />
            ) : (
              <Link2 className="w-3.5 h-3.5 text-[#F16A2E]" />
            )}
            <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSharePool()}
            aria-label={copiedShare ? 'Pool Blink copied' : 'Share pool Blink'}
            title={copiedShare ? 'Blink copied' : 'Share pool Blink'}
            className="w-11 h-11 rounded-full bg-white border border-[#EFE2D9] hover:border-[#F16A2E]/60 hover:bg-[#FFF9F5] text-[#111114] inline-flex items-center justify-center transition-colors shadow-[0_4px_14px_rgba(24,20,18,0.04)] shrink-0"
          >
            {copiedShare ? (
              <Check className="w-4 h-4 text-[#16A34A]" />
            ) : (
              <Share2 className="w-4 h-4 text-[#111114]" />
            )}
          </button>
        </div>
      </div>

      {/* Obsidian Squad Hero Banner */}
      <section className="relative overflow-hidden rounded-[28px] bg-[#141416] text-white p-6 sm:p-8 shadow-[0_14px_34px_rgba(17,17,20,0.18)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full actake-orb-glow opacity-30 blur-2xl"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 min-w-0">
            <MascotDisplay
              variant="obsidian"
              size="lg"
              floating
              alt="Actake Squad Lobby Mascot"
            />
            <div className="space-y-2.5 min-w-0">
              <div className="text-xs font-semibold text-[#F16A2E]">
                Solana Squad Lobby · Daily {deadlineLabel} Cutoff · {pool.totalDays}-Day Pool · Code{' '}
                <span className="font-mono text-white">{inviteCode}</span>
              </div>
              <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                {pool.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm tabular-nums text-white/85">
                <span className="font-bold text-[#4ADE80]">
                  ${pool.totalStaked.toFixed(2)} {pool.tokenSymbol} Pot
                </span>
                <span aria-hidden="true">·</span>
                <span>${pool.stakeAmount} Entry Stake</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#FCA5A5]">${pool.slashedPotAvailable} Slashed Bonus</span>
                <span aria-hidden="true">·</span>
                <span>{totalTractionMembers} Members</span>
              </div>
              <div className="text-[11px] font-mono text-white/55 truncate">
                Pool PDA: {pool.poolPubkey}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={joining}
              onClick={() => void handleMatchAndJoin()}
              className="min-h-[48px] px-5 py-3 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {joining ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wallet className="w-4 h-4" />
              )}
              <span>
                {!wallet
                  ? 'Connect Wallet to Join'
                  : alreadyJoined
                    ? 'Joined · Added to Personal Alarms'
                    : `Match $${pool.stakeAmount} ${pool.tokenSymbol} & Join`}
              </span>
            </button>

            {alreadyJoined && onGoToToday ? (
              <button
                type="button"
                onClick={onGoToToday}
                className="min-h-[48px] px-5 py-3 rounded-full bg-white text-[#111114] hover:bg-[#FFF4EE] text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Clock className="w-4 h-4 text-[#F16A2E]" />
                <span>View Personal Alarm</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartWebcamProof}
                className="min-h-[48px] px-5 py-3 rounded-full bg-white text-[#111114] hover:bg-[#FFF4EE] text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Camera className="w-4 h-4 text-[#F16A2E]" />
                <span>Webcam Check-In</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Live Team Traction Summary Strip */}
      <section className="actake-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#111114] uppercase tracking-wider">
            <Users className="w-4 h-4 text-[#F16A2E]" />
            <span>Live Team Traction</span>
          </div>
          <span className="text-xs font-mono font-bold text-[#16A34A] tabular-nums">
            {verifiedPctToday}% verified today · {totalTractionMembers} total members
          </span>
        </div>

        <div className="h-2 w-full rounded-full bg-[#F7ECE6] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#16A34A] transition-all"
            style={{ width: `${verifiedPctToday}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6663] tabular-nums">
          <span>
            <strong className="text-[#16A34A]">{verifiedTractionCount} verified</strong> ·{' '}
            <strong className="text-[#111114]">{activeTractionCount} active</strong> ·{' '}
            <strong className="text-[#DC2626]">{slashedTractionCount} slashed</strong>
          </span>
          <span>
            Daily {deadlineLabel} personal alarm syncs automatically on join
          </span>
        </div>
      </section>

      {joinNotice && (
        <div className="rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] px-4 py-3 text-xs font-medium text-[#166534] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#16A34A]" />
            <span>{joinNotice}</span>
          </div>
          {onGoToToday && (
            <button
              type="button"
              onClick={onGoToToday}
              className="min-h-[38px] px-4 py-1.5 rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold whitespace-nowrap transition-colors"
            >
              View Personal Alarm on Today
            </button>
          )}
        </div>
      )}

      {error && (
        <ErrorStateCard
          title="Lobby action failed"
          message={error}
          onRetry={() => void loadLobby()}
          retryLabel="Refresh Lobby"
        />
      )}

      {/* 1st Component: Collapsible "What This Pool Is About" (collapsed by default) */}
      <section className="actake-card overflow-hidden">
        <button
          type="button"
          aria-expanded={aboutExpanded}
          onClick={() => setAboutExpanded((prev) => !prev)}
          className="w-full px-5 sm:px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
              <Info className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm sm:text-base font-extrabold text-[#111114]">
                What This Pool Is About
              </div>
              <p className="text-xs text-[#6B6663] truncate">
                {aboutExpanded
                  ? 'Daily cutoff, live verification & payout rules'
                  : 'Tap to read pool rules, daily cutoff & slashing split'}
              </p>
            </div>
          </div>

          <span className="min-h-[36px] px-3 py-1.5 rounded-full bg-[#FFF4EE] text-[#F16A2E] text-xs font-bold inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
            <span>{aboutExpanded ? 'Collapse' : 'Read more'}</span>
            {aboutExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        </button>

        {aboutExpanded && (
          <div className="px-5 sm:px-6 pb-6 pt-3 border-t border-[#F4ECE7] grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <p className="text-xs sm:text-sm text-[#4F4A47] leading-relaxed">
                <strong>{pool.title}</strong> is a {pool.totalDays}-day daily accountability pool on
                Solana Devnet. Every participant locks{' '}
                <strong>
                  ${pool.stakeAmount} {pool.tokenSymbol}
                </strong>{' '}
                and must submit a live AI-verified camera proof before{' '}
                <strong>{deadlineLabel}</strong> each day. Members who stay verified reclaim 100% of
                their stake plus a pro-rata share of the{' '}
                <strong>
                  ${pool.slashedPotAvailable} {pool.tokenSymbol}
                </strong>{' '}
                slashed bonus pot from anyone who misses.
              </p>
            </div>

            <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-4 space-y-2 text-xs">
              <div className="font-bold text-[#111114] inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#F16A2E]" />
                <span>Verification Requirements</span>
              </div>
              <p className="text-[#6B6663] leading-relaxed">
                Live proof environment:{' '}
                {pool.environmentHint || 'Daily randomized household or gym proof'}.
              </p>
              <div className="text-[11px] font-semibold text-[#16A34A] pt-1">
                {pool.tokenSymbol === 'SKR'
                  ? '0% SKR protocol fee · Full slashed split to verified leaders'
                  : '1.5% USDC protocol fee · Slashed stakes split pro-rata among winners'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2nd Component: Status-Ranked Pool Leaderboard (immediately after What This Pool Is About) */}
      <div className="space-y-6">
        <div className="actake-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-extrabold text-[#111114] flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#F16A2E]" />
                  <span>Pool Leaderboard</span>
                </h2>
                <p className="text-[11px] text-[#6B6663] mt-0.5">
                  Ranked by status (Verified Leaders → Slashed) &amp; streak
                </p>
              </div>
              <span className="text-xs font-semibold text-[#6B6663] tabular-nums">
                {rankedParticipants.length} ranked
              </span>
            </div>

            {rankedParticipants.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `All (${rankedParticipants.length})` },
                    { id: 'verified', label: `Verified (${activeLeaderboardCount})` },
                    { id: 'slashed', label: `Slashed (${slashedLeaderboardCount})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={`min-h-[32px] px-3 py-1 rounded-full text-[11px] font-bold transition-colors border ${
                      statusFilter === f.id
                        ? 'bg-[#111114] border-[#111114] text-white'
                        : 'bg-white border-[#EFE2D9] text-[#6B6663] hover:text-[#111114]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {rankedParticipants.length === 0 ? (
              <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-4 text-center space-y-2.5">
                <p className="text-xs text-[#6B6663]">
                  No participants yet. Match the stake above to lead this squad.
                </p>
                <button
                  type="button"
                  onClick={() => void handleMatchAndJoin()}
                  className="min-h-[40px] px-4 py-1.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold transition-colors"
                >
                  Be First to Join
                </button>
              </div>
            ) : filteredParticipants.length === 0 ? (
              <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-4 text-center space-y-2">
                <p className="text-xs text-[#6B6663]">No members in this status filter yet.</p>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="text-xs font-bold text-[#F16A2E] hover:underline"
                >
                  Show all ranked members
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#F6EFEA]">
                {filteredParticipants.map((p) => {
                  const globalRank = rankedParticipants.findIndex((item) => item.id === p.id) + 1;
                  const pct = Math.min(
                    100,
                    Math.round((p.checkinsCompleted / Math.max(1, pool.totalDays)) * 100)
                  );
                  const estSplit =
                    !p.isSlashed && activeLeaderboardCount > 0
                      ? pool.slashedPotAvailable / activeLeaderboardCount
                      : 0;

                  return (
                    <div
                      key={p.id}
                      className={`py-3.5 px-2.5 -mx-2.5 rounded-2xl flex items-center justify-between gap-3 text-sm ${
                        p.isSlashed
                          ? 'bg-[#FEF2F2]/55'
                          : globalRank === 1
                            ? 'bg-[#FFFBEB]/70'
                            : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono text-xs font-extrabold shrink-0 tabular-nums ${
                            p.isSlashed
                              ? 'bg-[#FEE2E2] text-[#DC2626]'
                              : globalRank === 1
                                ? 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
                                : globalRank === 2
                                  ? 'bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]'
                                  : globalRank === 3
                                    ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FED7AA]'
                                    : 'bg-[#FFF8F4] text-[#6B6663]'
                          }`}
                        >
                          {!p.isSlashed && globalRank === 1 ? (
                            <Crown className="w-3.5 h-3.5" />
                          ) : !p.isSlashed && globalRank <= 3 ? (
                            <Award className="w-3.5 h-3.5" />
                          ) : (
                            `#${globalRank}`
                          )}
                        </span>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-[#111114] truncate">
                              {p.displayName}
                            </span>
                            <span
                              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                p.isSlashed
                                  ? 'bg-[#FEE2E2] text-[#DC2626]'
                                  : 'bg-[#ECFDF5] text-[#15803D]'
                              }`}
                            >
                              {p.isSlashed ? 'Slashed' : 'Verified'}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#6B6663] font-mono">
                            {shortenAddress(p.userPubkey, 4)}
                          </div>
                          <div className="flex items-center gap-2 max-w-[160px]">
                            <div className="h-1.5 flex-1 rounded-full bg-[#F3E7DF] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  p.isSlashed ? 'bg-[#EF4444]' : 'bg-[#16A34A]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono font-bold text-[#6B6663] tabular-nums">
                              {p.checkinsCompleted}/{pool.totalDays}d
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 tabular-nums">
                        {p.isSlashed ? (
                          <>
                            <div className="text-xs font-extrabold text-[#DC2626]">
                              -${p.stakedAmount.toFixed(0)} {pool.tokenSymbol}
                            </div>
                            <div className="text-[11px] font-semibold text-[#991B1B]">
                              Forfeited
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs font-extrabold text-[#16A34A]">
                              +${estSplit.toFixed(2)} est.
                            </div>
                            <div className="text-[11px] font-semibold text-[#F16A2E] inline-flex items-center justify-end gap-0.5">
                              <Flame className="w-3 h-3" />
                              <span>{p.streakDays}d streak</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>

        {/* 3rd Component: Verified Check-In Proof Feed */}
        <div className="actake-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F4ECE7] flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-extrabold text-[#111114]">
                Verified Onchain Proof Feed
              </h2>
              <p className="text-xs text-[#6B6663]">
                AI Vision + Ed25519 oracle attestations recorded for this pool
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[#16A34A] tabular-nums whitespace-nowrap">
              {checkins.filter((c) => c.status === 'verified').length} verified
            </span>
          </div>

          {checkins.length === 0 ? (
            <div className="p-6">
              <EmptyState
                showMascot
                title="No Proofs Submitted Yet"
                description="Be the first member in this squad to pass a live AI camera verification check-in."
                ctaLabel="Submit First Webcam Proof"
                onCta={handleStartWebcamProof}
                className="border-0 shadow-none"
              />
            </div>
          ) : (
            <div className="divide-y divide-[#F6EFEA]">
              {checkins.map((item) => (
                <div key={item.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                          item.status === 'verified'
                            ? 'bg-[#111114] text-white'
                            : 'bg-[#FEE2E2] text-[#991B1B]'
                        }`}
                      >
                        {item.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#111114] flex flex-wrap items-center gap-1.5">
                          <span>{item.memberName}</span>
                          <span className="text-[#A09A96] font-normal">·</span>
                          <span className="text-xs font-medium text-[#6B6663]">
                            {item.targetPrompt}
                          </span>
                          {item.status === 'verified' && (
                            <>
                              <span className="text-[#A09A96] font-normal">·</span>
                              <span className="text-xs font-mono text-[#16A34A] tabular-nums">
                                {Math.round(item.confidence * 100)}% AI match
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-[#6B6663] mt-1 leading-relaxed">
                          {item.reason}
                        </p>
                        {item.proofHash && (
                          <div className="text-[11px] font-mono text-[#8E8782] mt-1.5 truncate">
                            SHA-256: {item.proofHash.slice(0, 20)}... · Ed25519:{' '}
                            {item.oracleSignature.slice(0, 16)}...
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {item.status === 'verified' ? (
                        <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
                      ) : (
                        <XCircle className="w-5 h-5 text-[#DC2626]" />
                      )}
                    </div>
                  </div>

                  {item.status === 'verified' && (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReact(item.id, 'like')}
                        className="min-h-[38px] px-3.5 rounded-full bg-[#FFF8F4] border border-[#F2E3DA] hover:border-[#F16A2E] text-xs font-semibold text-[#111114] inline-flex items-center gap-1.5 tabular-nums transition-colors"
                      >
                        <ThumbsUp className="w-3.5 h-3.5 text-[#6B6663]" />
                        <span>{item.likes}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReact(item.id, 'fire')}
                        className="min-h-[38px] px-3.5 rounded-full bg-[#FFF8F4] border border-[#F2E3DA] hover:border-[#F16A2E] text-xs font-semibold text-[#111114] inline-flex items-center gap-1.5 tabular-nums transition-colors"
                      >
                        <Flame className="w-3.5 h-3.5 text-[#F16A2E]" />
                        <span>{item.fires}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
