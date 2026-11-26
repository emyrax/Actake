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
    loadLobby();
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
      protocolFeePct: pool.tokenSymbol === 'SKR' ? 0 : 2.5,
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
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-sm text-[#5E6470]">
        <Loader2 className="w-6 h-6 animate-spin text-[#E86F48]" />
        <span>Loading squad lobby &amp; Solana Blink metadata...</span>
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="actake-card p-8 text-center space-y-4">
        <h2 className="font-display text-xl font-bold text-[#111114]">Squad Pool Not Found</h2>
        <p className="text-sm text-[#5E6470]">{error || 'This pool link may have expired.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#141416] text-white text-sm font-semibold"
        >
          Return to Actake
        </button>
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
          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-[#E6E6EC] text-xs font-semibold text-[#111114] hover:bg-[#F1F1F5] inline-flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Squads</span>
        </button>

        <div className="text-xs font-mono text-[#5E6470]">/squad/{pool.id}</div>
      </div>

      {/* Obsidian Squad Hero Banner with Metallic Orb Glow */}
      <section className="relative overflow-hidden rounded-[28px] bg-[#141416] text-white p-6 sm:p-8 shadow-[0_12px_32px_rgba(17,17,20,0.16)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full actake-orb-glow opacity-35 blur-2xl"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-3">
            <div className="text-xs font-medium text-white/70">
              Solana Squad Lobby · Daily {deadlineLabel} Cutoff · {pool.totalDays}-Day Pool
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              {pool.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm tabular-nums text-white/85">
              <span className="font-semibold text-[#22C55E]">
                ${pool.totalStaked.toFixed(2)} {pool.tokenSymbol} Pot
              </span>
              <span aria-hidden="true">·</span>
              <span>${pool.stakeAmount} Entry Stake</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#FCA5A5]">${pool.slashedPotAvailable} Slashed Bonus</span>
              <span aria-hidden="true">·</span>
              <span>{pool.participantCount} Members</span>
            </div>
            <div className="text-xs font-mono text-white/55">
              Pool PDA: {pool.poolPubkey}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={joining}
              onClick={handleMatchAndJoin}
              className="min-h-[48px] px-5 py-3 rounded-2xl bg-[#E86F48] hover:bg-[#D55E38] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60"
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
              className="min-h-[48px] px-5 py-3 rounded-2xl bg-white text-[#111114] hover:bg-[#F3F4F6] text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Camera className="w-4 h-4 text-[#E86F48]" />
              <span>Browser Webcam Check-In</span>
            </button>
          </div>
        </div>
      </section>

      {joinNotice && (
        <div className="rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] px-4 py-3 text-xs font-medium text-[#065F46] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-[#22C55E]" />
          <span>{joinNotice}</span>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#991B1B]">
          {error}
        </div>
      )}

      {/* Main 2-Column Split: Leaderboard + Solana Blink Card | Verified Check-In Proof Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Leaderboard & Live Solana Blink Card */}
        <div className="lg:col-span-5 space-y-6">
          {/* Leaderboard */}
          <div className="actake-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#111114] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#E86F48]" />
                <span>Squad Leaderboard</span>
              </h2>
              <span className="text-xs text-[#5E6470] tabular-nums">
                {participants.length} tracked
              </span>
            </div>

            {participants.length === 0 ? (
              <p className="text-xs text-[#5E6470]">
                No participants yet. Match the stake above to lead this squad.
              </p>
            ) : (
              <div className="divide-y divide-[#F0F0F4]">
                {participants.map((p, idx) => (
                  <div
                    key={p.id}
                    className="py-3 flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs font-bold text-[#5E6470] w-5 tabular-nums">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-[#111114] truncate">{p.displayName}</div>
                        <div className="text-xs text-[#5E6470] font-mono">
                          {shortenAddress(p.userPubkey, 4)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-xs font-bold text-[#111114]">
                        {p.checkinsCompleted}/{pool.totalDays} days
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
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
              <h2 className="font-display text-lg font-bold text-[#111114] flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#E86F48]" />
                <span>Solana Blink Action</span>
              </h2>
              <span className="text-[11px] font-mono text-[#5E6470]">
                /api/actions/join/{pool.id}
              </span>
            </div>

            {blinkMeta && (
              <div className="rounded-2xl bg-[#F7F7F9] border border-[#E8E8EE] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/assets/aistudio/Gemini_Generated_Image_eh2x1teh2x1teh2x_c3446dad.jpg"
                    alt="Actake Blink Card Icon"
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#111114] truncate">
                      {blinkMeta.title}
                    </div>
                    <div className="text-xs text-[#5E6470] line-clamp-2 mt-0.5">
                      {blinkMeta.description}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={testingBlinkTx}
                  onClick={handleTestBlinkActionPost}
                  className="w-full min-h-[42px] rounded-xl bg-[#141416] hover:bg-[#232329] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  {testingBlinkTx ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5 text-[#E86F48]" />
                  )}
                  <span>{blinkMeta.label} (Preview Blink Tx)</span>
                </button>
              </div>
            )}

            {blinkTxPreview && (
              <div className="rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] p-3 text-[11px] font-mono text-[#065F46] break-all">
                {blinkTxPreview}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleCopy('blink')}
                className="min-h-[42px] rounded-xl bg-[#F7F7F9] border border-[#E6E6EC] hover:border-[#141416] text-xs font-semibold text-[#111114] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                {copiedLink === 'blink' ? (
                  <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#5E6470]" />
                )}
                <span>{copiedLink === 'blink' ? 'Blink Copied' : 'Copy Blink URL'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopy('lobby')}
                className="min-h-[42px] rounded-xl bg-[#F7F7F9] border border-[#E6E6EC] hover:border-[#141416] text-xs font-semibold text-[#111114] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                {copiedLink === 'lobby' ? (
                  <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                ) : (
                  <Users className="w-3.5 h-3.5 text-[#5E6470]" />
                )}
                <span>{copiedLink === 'lobby' ? 'Lobby Copied' : 'Copy Lobby Link'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Verified Check-In Proof Feed */}
        <div className="lg:col-span-7 actake-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F0F0F4] flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-[#111114]">
                Verified Onchain Proof Feed
              </h2>
              <p className="text-xs text-[#5E6470]">
                AI Vision + Ed25519 oracle attestations recorded for this pool
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-[#16A34A] tabular-nums">
              {checkins.filter((c) => c.status === 'verified').length} verified
            </span>
          </div>

          {checkins.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-[#5E6470]">
                No check-ins submitted yet for this squad.
              </p>
              <button
                type="button"
                onClick={handleStartWebcamProof}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#E86F48] text-white text-xs font-semibold"
              >
                Submit First Webcam Proof
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#F0F0F4]">
              {checkins.map((item) => (
                <div key={item.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                          item.status === 'verified'
                            ? 'bg-[#141416] text-white'
                            : 'bg-[#FEE2E2] text-[#991B1B]'
                        }`}
                      >
                        {item.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#111114] flex flex-wrap items-center gap-1.5">
                          <span>{item.memberName}</span>
                          <span className="text-[#8E8E93] font-normal">·</span>
                          <span className="text-xs font-medium text-[#5E6470]">
                            {item.targetPrompt}
                          </span>
                          {item.status === 'verified' && (
                            <>
                              <span className="text-[#8E8E93] font-normal">·</span>
                              <span className="text-xs font-mono text-[#16A34A] tabular-nums">
                                {Math.round(item.confidence * 100)}% AI match
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-[#5E6470] mt-1 leading-relaxed">
                          {item.reason}
                        </p>
                        {item.proofHash && (
                          <div className="text-[11px] font-mono text-[#8E8E93] mt-1.5 truncate">
                            SHA-256: {item.proofHash.slice(0, 20)}... · Ed25519:{' '}
                            {item.oracleSignature.slice(0, 16)}...
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {item.status === 'verified' ? (
                        <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                      ) : (
                        <XCircle className="w-5 h-5 text-[#DC2626]" />
                      )}
                    </div>
                  </div>

                  {item.status === 'verified' && (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleReact(item.id, 'like')}
                        className="min-h-[34px] px-3 rounded-lg bg-[#F7F7F9] border border-[#E6E6EC] hover:border-[#E86F48] text-xs font-semibold text-[#111114] inline-flex items-center gap-1.5 tabular-nums transition-colors"
                      >
                        <ThumbsUp className="w-3.5 h-3.5 text-[#5E6470]" />
                        <span>{item.likes}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReact(item.id, 'fire')}
                        className="min-h-[34px] px-3 rounded-lg bg-[#F7F7F9] border border-[#E6E6EC] hover:border-[#E86F48] text-xs font-semibold text-[#111114] inline-flex items-center gap-1.5 tabular-nums transition-colors"
                      >
                        <Flame className="w-3.5 h-3.5 text-[#E86F48]" />
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
