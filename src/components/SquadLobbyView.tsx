import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Flame,
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
import { MascotDisplay } from './MascotDisplay';
import { EmptyState, ErrorStateCard, LobbyLayoutSkeleton } from './UiPrimitives';

interface LobbyPool {
  id: string;
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

interface BlinkMetadata {
  title: string;
  description: string;
  label: string;
  icon: string;
}

interface SquadLobbyViewProps {
  poolId: string;
  wallet: WalletSession | null;
  onBack: () => void;
  onRequestConnectWallet: () => void;
  onLaunchBrowserCheckin: (stake: StakeCommitment, poolId: string) => void;
}

function formatAlarm12h(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}

export const SquadLobbyView: React.FC<SquadLobbyViewProps> = ({
  poolId,
  wallet,
  onBack,
  onRequestConnectWallet,
  onLaunchBrowserCheckin,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState<LobbyPool | null>(null);
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [checkins, setCheckins] = useState<LiveCheckinRecord[]>([]);
  const [blinkMeta, setBlinkMeta] = useState<BlinkMetadata | null>(null);

  const [joining, setJoining] = useState(false);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<'blink' | 'lobby' | null>(null);
  const [testingBlinkTx, setTestingBlinkTx] = useState(false);
  const [blinkTxPreview, setBlinkTxPreview] = useState<string | null>(null);

  const loadLobby = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lobbyResp, blinkResp] = await Promise.all([
        fetch(`/api/pools/${encodeURIComponent(poolId)}`),
        fetch(`/api/actions/join/${encodeURIComponent(poolId)}`),
      ]);
      if (!lobbyResp.ok) {
        throw new Error('This squad pool could not be found.');
      }
      const data = await lobbyResp.json();
      setPool(data.pool);
      setParticipants(data.participants || []);
      setCheckins(data.checkins || []);
      if (blinkResp.ok) {
        setBlinkMeta(await blinkResp.json());
      }
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
    wallet && participants.some((p) => p.userPubkey === wallet.publicKey)
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
      const { signature } = await signActakeTransaction(tx, wallet);

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
      setJoinNotice(
        `Matched $${pool.stakeAmount} ${pool.tokenSymbol} & joined pool (${signature.slice(0, 14)}...).`
      );
      await loadLobby();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join squad pool.');
    } finally {
      setJoining(false);
    }
  };

  const handleTestBlinkActionPost = async () => {
    if (!pool) return;
    setTestingBlinkTx(true);
    setBlinkTxPreview(null);
    try {
      const account = wallet?.publicKey || '11111111111111111111111111111111';
      const resp = await fetch(`/api/actions/join/${encodeURIComponent(pool.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || 'Blink action test failed.');
      setBlinkTxPreview(
        `${data.message} · Base64 Tx (${String(data.transaction).length} chars): ${String(
          data.transaction
        ).slice(0, 48)}...`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to preview Solana Blink transaction.');
    } finally {
      setTestingBlinkTx(false);
    }
  };

  const handleCopy = async (kind: 'blink' | 'lobby') => {
    if (!pool) return;
    const text =
      kind === 'blink'
        ? buildSquadBlinkUrl({
            poolId: pool.id,
            squadName: pool.title,
            amount: pool.stakeAmount,
            token: pool.tokenSymbol,
            alarmTime: formatAlarm12h(pool.alarmHour, pool.alarmMinute),
          })
        : buildSquadLobbyUrl(pool.id);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(kind);
      window.setTimeout(() => setCopiedLink(null), 2000);
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

  return (
    <div className="space-y-6 pb-10">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-4 py-2 rounded-full bg-white border border-[#EFE2D9] text-xs font-bold text-[#111114] hover:bg-[#FFF9F5] inline-flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Explore</span>
        </button>

        <div className="text-xs font-mono text-[#6B6663] truncate">/squad/{pool.id}</div>
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
                Solana Squad Lobby · Daily {deadlineLabel} Cutoff · {pool.totalDays}-Day Pool
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
                <span>{pool.participantCount} Members</span>
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
                    ? 'Stake Matched (Joined)'
                    : `Match $${pool.stakeAmount} ${pool.tokenSymbol} & Join`}
              </span>
            </button>

            <button
              type="button"
              onClick={handleStartWebcamProof}
              className="min-h-[48px] px-5 py-3 rounded-full bg-white text-[#111114] hover:bg-[#FFF4EE] text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Camera className="w-4 h-4 text-[#F16A2E]" />
              <span>Webcam Check-In</span>
            </button>
          </div>
        </div>
      </section>

      {joinNotice && (
        <div className="rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] px-4 py-3 text-xs font-medium text-[#166534] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-[#16A34A]" />
          <span>{joinNotice}</span>
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

      {/* Main 2-Column Split: Leaderboard + Solana Blink Card | Verified Check-In Proof Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Leaderboard & Live Solana Blink Card */}
        <div className="lg:col-span-5 space-y-6">
          {/* Leaderboard */}
          <div className="actake-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-[#111114] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#F16A2E]" />
                <span>Squad Leaderboard</span>
              </h2>
              <span className="text-xs text-[#6B6663] tabular-nums">
                {participants.length} tracked
              </span>
            </div>

            {participants.length === 0 ? (
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
            ) : (
              <div className="divide-y divide-[#F6EFEA]">
                {participants.map((p, idx) => (
                  <div
                    key={p.id}
                    className="py-3 flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs font-bold text-[#877F7A] w-5 tabular-nums">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-[#111114] truncate">{p.displayName}</div>
                        <div className="text-xs text-[#6B6663] font-mono">
                          {shortenAddress(p.userPubkey, 4)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-xs font-bold text-[#111114]">
                        {p.checkinsCompleted}/{pool.totalDays} days
                      </div>
                      <div
                        className={`text-[11px] font-semibold ${
                          p.isSlashed ? 'text-[#DC2626]' : 'text-[#16A34A]'
                        }`}
                      >
                        {p.isSlashed ? 'Slashed' : `${p.streakDays}d streak`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Solana Blink Card (@solana/actions) */}
          <div className="actake-card p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-extrabold text-[#111114] flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#F16A2E]" />
                <span>Solana Blink Action</span>
              </h2>
              <span className="text-[11px] font-mono text-[#6B6663] truncate">
                /api/actions/join/{pool.id}
              </span>
            </div>

            {blinkMeta && (
              <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-4 space-y-3">
                <div className="flex items-center gap-3.5">
                  <MascotDisplay
                    variant="medallion"
                    size="md"
                    alt="Actake Blink Card Mascot"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#111114] truncate">
                      {blinkMeta.title}
                    </div>
                    <div className="text-xs text-[#6B6663] line-clamp-2 mt-0.5">
                      {blinkMeta.description}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={testingBlinkTx}
                  onClick={() => void handleTestBlinkActionPost()}
                  className="w-full min-h-[44px] rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {testingBlinkTx ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5 text-[#F16A2E]" />
                  )}
                  <span>{blinkMeta.label} (Preview Blink Tx)</span>
                </button>
              </div>
            )}

            {blinkTxPreview && (
              <div className="rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] p-3 text-[11px] font-mono text-[#166534] break-all">
                {blinkTxPreview}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void handleCopy('blink')}
                className="min-h-[44px] rounded-full bg-[#FFF4EE] border border-[#F2E3DA] hover:bg-[#FFE5D6] text-xs font-bold text-[#111114] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                {copiedLink === 'blink' ? (
                  <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#F16A2E]" />
                )}
                <span>{copiedLink === 'blink' ? 'Blink Copied' : 'Copy Blink URL'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('lobby')}
                className="min-h-[44px] rounded-full bg-[#FFF4EE] border border-[#F2E3DA] hover:bg-[#FFE5D6] text-xs font-bold text-[#111114] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                {copiedLink === 'lobby' ? (
                  <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                ) : (
                  <Users className="w-3.5 h-3.5 text-[#F16A2E]" />
                )}
                <span>{copiedLink === 'lobby' ? 'Lobby Copied' : 'Copy Lobby Link'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Verified Check-In Proof Feed */}
        <div className="lg:col-span-7 actake-card overflow-hidden">
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
