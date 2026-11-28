import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Dumbbell,
  ExternalLink,
  Footprints,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  MapPin,
  Play,
  ShieldCheck,
  Smartphone,
  Square,
  Users,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import type { WalletSession } from '../../../types/actake';
import { calculateDailyPayoutBreakdown } from '../../../utils/stakePayouts';
import {
  ACCOUNTABILITY_TRACKS,
  type StepStakeDailyClaimReceipt,
  type StepStakePool,
  type TrackProofPayload,
} from '../types';
import {
  createScopedEphemeralSessionKey,
  executeJoinPoolAndStakeTx,
  executeMarkQuitterSlashedTx,
  executeSettleAndClaimTx,
  executeSlashSoloChallengeDayTx,
  executeSubmitDailyCheckinTx,
  getSolscanAccountUrl,
  getSolscanTxUrl,
} from '../walletClient';
import {
  isNativeAndroidStepBridgeAvailable,
  readNativeDailyStepProof,
  scheduleNativeMidnightStepMonitor,
  startNativeHardwareStepSensor,
  syncEphemeralSessionKeyToNative,
} from '../trackers/stepsTracker';
import {
  buildGymDwellProof,
  startGymGeofenceWatcher,
  type GymTrackerState,
} from '../trackers/gymTracker';
import {
  buildStudyFocusProof,
  startStudyFocusSession,
  type StudyTrackerState,
} from '../trackers/studyTracker';

interface PoolDashboardProps {
  pool: StepStakePool;
  wallet: WalletSession;
  escrowWallet?: string | null;
  treasuryWallet?: string | null;
  onPoolUpdated: (updated: StepStakePool) => void;
  onTxConfirmed: (summary: {
    title: string;
    signature: string;
    solscanUrl: string;
    payoutSignature?: string | null;
    payoutSolscanUrl?: string | null;
    payoutDetail?: string;
  }) => void;
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getSecondsUntilLocalMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

export const PoolDashboard: React.FC<PoolDashboardProps> = ({
  pool,
  wallet,
  escrowWallet = null,
  treasuryWallet = null,
  onPoolUpdated,
  onTxConfirmed,
}) => {
  const trackMeta = ACCOUNTABILITY_TRACKS[pool.category];
  const [midnightCountdownSec, setMidnightCountdownSec] = useState<number>(() =>
    getSecondsUntilLocalMidnight()
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [optInSeamlessOnJoin, setOptInSeamlessOnJoin] = useState(false);

  // Track-specific live proof collector state (strictly opt-in; never auto-starts on mount)
  const [nativeStepsAvailable] = useState<boolean>(() => isNativeAndroidStepBridgeAvailable());
  const [nativeStepCount, setNativeStepCount] = useState<number>(0);
  const [nativeStepNotice, setNativeStepNotice] = useState<string | null>(null);

  const [gymState, setGymState] = useState<GymTrackerState>({
    active: false,
    insideZone: false,
    currentDistanceMeters: null,
    accuracyMeters: null,
    verifiedDwellSeconds: 0,
    verifiedMinutes: 0,
    samples: [],
    error: null,
  });
  const stopGymRef = useRef<(() => void) | null>(null);

  const [studyState, setStudyState] = useState<StudyTrackerState>({
    active: false,
    pausedByTabSwitch: false,
    elapsedSeconds: 0,
    focusedMinutes: 0,
    interruptions: 0,
    heartbeats: [],
  });
  const stopStudyRef = useRef<(() => void) | null>(null);

  const [readyProof, setReadyProof] = useState<TrackProofPayload | null>(null);

  // Clean up opt-in watchers when switching pools or unmounting
  useEffect(() => {
    setActionError(null);
    setReadyProof(null);
    setNativeStepNotice(null);
    stopGymRef.current?.();
    stopGymRef.current = null;
    stopStudyRef.current?.();
    stopStudyRef.current = null;
    setGymState((prev) => ({ ...prev, active: false, error: null }));
    setStudyState((prev) => ({ ...prev, active: false }));
    return () => {
      stopGymRef.current?.();
      stopStudyRef.current?.();
    };
  }, [pool.id]);

  // Live 1-second midnight cutoff ticker
  useEffect(() => {
    const id = window.setInterval(() => {
      setMidnightCountdownSec(getSecondsUntilLocalMidnight());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const currentParticipant = useMemo(
    () => pool.participants.find((p) => p.walletPubkey === wallet.publicKey) || null,
    [pool.participants, wallet.publicKey]
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const poolEndSec = pool.startTimestampSec + pool.durationDays * 86_400;
  const isPoolCompleted = nowSec >= poolEndSec;
  const elapsedDays = Math.max(1, Math.min(pool.durationDays, Math.floor((nowSec - pool.startTimestampSec) / 86_400) + 1));
  const nextCheckinDay = currentParticipant ? currentParticipant.lastCheckinDay + 1 : 1;

  // Compute today's live metric value across whichever track is active
  const todayMetricValue = useMemo(() => {
    if (readyProof) return readyProof.metricAchieved;
    if (pool.category === 0) return nativeStepCount;
    if (pool.category === 1) return gymState.verifiedMinutes;
    return studyState.focusedMinutes;
  }, [pool.category, readyProof, nativeStepCount, gymState.verifiedMinutes, studyState.focusedMinutes]);

  const progressPct = Math.min(
    100,
    Math.round((todayMetricValue / Math.max(1, pool.targetMetric)) * 100)
  );

  const isSoloPool = pool.visibility === 'solo';
  const survivorsCount = Math.max(1, pool.activeParticipants);
  const projectedBonusShare = isSoloPool
    ? 0
    : Number(
        (((pool.forfeitedVaultBalance / survivorsCount) * pool.skrMultiplierBps) / 10_000).toFixed(2)
      );
  const projectedTotalPayout = Number((pool.stakeAmount + projectedBonusShare).toFixed(2));

  // Identify the next verified day whose daily split principal has not yet been claimed
  const claimedDaySet = useMemo(
    () => new Set((currentParticipant?.claimedDays || []).map((c) => c.dayIndex)),
    [currentParticipant?.claimedDays]
  );

  const nextClaimableDay = useMemo(() => {
    if (!currentParticipant || currentParticipant.isEliminated || currentParticipant.hasClaimed) {
      return null;
    }
    for (let d = 1; d <= currentParticipant.lastCheckinDay; d += 1) {
      if (!claimedDaySet.has(d)) return d;
    }
    return null;
  }, [currentParticipant, claimedDaySet]);

  const nextClaimBreakdown = useMemo(() => {
    if (!nextClaimableDay) return null;
    return calculateDailyPayoutBreakdown({
      totalStake: pool.stakeAmount,
      totalDays: pool.durationDays,
      token: pool.tokenSymbol,
      visibility: pool.visibility,
      dayIndex: nextClaimableDay,
    });
  }, [nextClaimableDay, pool.stakeAmount, pool.durationDays, pool.tokenSymbol, pool.visibility]);

  // Participants eligible for missed-day slash (Public quitter crank OR Solo missed-day settlement)
  const overdueParticipants = useMemo(() => {
    const completedDayBoundary = Math.floor((nowSec - pool.startTimestampSec) / 86_400);
    if (completedDayBoundary < 1) return [];
    const missedDay = Math.min(pool.durationDays, completedDayBoundary);
    return pool.participants
      .filter((p) => !p.isEliminated && p.lastCheckinDay < missedDay)
      .map((p) => ({ participant: p, missedDay }));
  }, [pool.participants, pool.startTimestampSec, pool.durationDays, nowSec]);

  const handleJoinAndStake = async () => {
    setActionError(null);
    setBusyAction('join');
    try {
      let delegatePubkey: string | null = null;
      if (optInSeamlessOnJoin) {
        const bundle = await createScopedEphemeralSessionKey(pool.id, pool.durationDays);
        delegatePubkey = bundle.delegatePubkey;
        await syncEphemeralSessionKeyToNative({
          delegatePubkey: bundle.delegatePubkey,
          expiresAtMs: bundle.expiresAtMs,
        });
      }

      const txRes = await executeJoinPoolAndStakeTx({
        wallet,
        poolId: pool.id,
        creatorPubkey: pool.creatorPubkey,
        poolNumericId: pool.poolNumericId,
        tokenSymbol: pool.tokenSymbol,
        stakeAmount: pool.stakeAmount,
        escrowWallet,
        sessionDelegatePubkey: delegatePubkey,
      });

      const resp = await fetch(`/api/step-stake/pools/${encodeURIComponent(pool.id)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey: wallet.publicKey,
          displayName: wallet.username ? `@${wallet.username}` : wallet.walletName || undefined,
          stakeTxSignature: txRes.signature,
          sessionDelegatePubkey: delegatePubkey,
        }),
      });
      const data = (await resp.json()) as { pool?: StepStakePool; error?: string };
      if (!resp.ok || !data.pool) {
        throw new Error(data.error || 'Failed to sync join state.');
      }

      if (pool.category === 0 && nativeStepsAvailable) {
        await scheduleNativeMidnightStepMonitor({
          poolId: pool.id,
          wallet: wallet.publicKey,
          dayIndex: 1,
          targetSteps: pool.targetMetric,
        });
      }

      onPoolUpdated(data.pool);
      onTxConfirmed({
        title: `Staked $${pool.stakeAmount} ${pool.tokenSymbol} into ${pool.title}`,
        signature: txRes.signature,
        solscanUrl: txRes.solscanUrl,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to join and stake.');
    } finally {
      setBusyAction(null);
    }
  };

  // --- Track Collector Handlers ---
  const handleStartStepsHardware = async () => {
    setActionError(null);
    const res = await startNativeHardwareStepSensor();
    setNativeStepNotice(res.message);
    if (res.available) {
      setNativeStepCount(res.dailySteps);
      try {
        const proof = await readNativeDailyStepProof({
          wallet: wallet.publicKey,
          poolId: pool.id,
          dayIndex: nextCheckinDay,
        });
        setNativeStepCount(proof.metricAchieved);
        if (proof.metricAchieved >= pool.targetMetric) {
          setReadyProof(proof);
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not read step proof.');
      }
    }
  };

  const handleToggleGymWatcher = () => {
    setActionError(null);
    if (gymState.active) {
      stopGymRef.current?.();
      stopGymRef.current = null;
      setGymState((prev) => ({ ...prev, active: false }));
      return;
    }
    const targetLat = pool.gymLat ?? 37.7897;
    const targetLng = pool.gymLng ?? -122.4014;
    stopGymRef.current = startGymGeofenceWatcher({
      gymLat: targetLat,
      gymLng: targetLng,
      radiusMeters: pool.gymRadiusMeters ?? 150,
      onUpdate: (nextState) => setGymState(nextState),
    });
  };

  const handleFinalizeGymProof = async () => {
    setActionError(null);
    if (gymState.verifiedMinutes < pool.targetMetric) {
      setActionError(
        `Stay inside the 150m gym zone until you reach ${pool.targetMetric} mins (${gymState.verifiedMinutes} mins logged so far).`
      );
      return;
    }
    const proof = await buildGymDwellProof({
      wallet: wallet.publicKey,
      poolId: pool.id,
      dayIndex: nextCheckinDay,
      gymLat: pool.gymLat ?? 37.7897,
      gymLng: pool.gymLng ?? -122.4014,
      radiusMeters: pool.gymRadiusMeters ?? 150,
      verifiedMinutes: gymState.verifiedMinutes,
      samples: gymState.samples,
    });
    setReadyProof(proof);
  };

  const handleToggleStudySession = () => {
    setActionError(null);
    if (studyState.active) {
      stopStudyRef.current?.();
      stopStudyRef.current = null;
      setStudyState((prev) => ({ ...prev, active: false }));
      return;
    }
    stopStudyRef.current = startStudyFocusSession({
      onUpdate: (nextState) => setStudyState(nextState),
    });
  };

  const handleFinalizeStudyProof = async () => {
    setActionError(null);
    if (studyState.focusedMinutes < pool.targetMetric) {
      setActionError(
        `Keep this tab focused until ${pool.targetMetric} mins are completed (${studyState.focusedMinutes} mins focused so far).`
      );
      return;
    }
    const proof = await buildStudyFocusProof({
      wallet: wallet.publicKey,
      poolId: pool.id,
      dayIndex: nextCheckinDay,
      focusedMinutes: studyState.focusedMinutes,
      interruptions: studyState.interruptions,
      heartbeats: studyState.heartbeats,
    });
    setReadyProof(proof);
  };

  const handleSubmitProofOnChain = async () => {
    if (!currentParticipant) {
      setActionError('Join and stake in this pool first before submitting daily proofs.');
      return;
    }
    if (!readyProof || readyProof.metricAchieved < pool.targetMetric) {
      setActionError(
        `Reach the daily target (${pool.targetMetric.toLocaleString()} ${trackMeta.unitShort}) and generate a verified SHA-256 proof first.`
      );
      return;
    }
    setActionError(null);
    setBusyAction('checkin');
    try {
      const txRes = await executeSubmitDailyCheckinTx({
        wallet,
        poolId: pool.id,
        creatorPubkey: pool.creatorPubkey,
        poolNumericId: pool.poolNumericId,
        dayIndex: nextCheckinDay,
        metricAchieved: readyProof.metricAchieved,
        proofHash: readyProof.proofHash,
      });

      const resp = await fetch(`/api/step-stake/pools/${encodeURIComponent(pool.id)}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey: wallet.publicKey,
          dayIndex: nextCheckinDay,
          metricAchieved: readyProof.metricAchieved,
          proofHash: readyProof.proofHash,
          txSignature: txRes.signature,
          onchainMode: txRes.onchainMode,
        }),
      });
      const data = (await resp.json()) as { pool?: StepStakePool; error?: string };
      if (!resp.ok || !data.pool) {
        throw new Error(data.error || 'Unable to sync verified daily proof.');
      }

      stopGymRef.current?.();
      stopStudyRef.current?.();
      setReadyProof(null);
      onPoolUpdated(data.pool);
      onTxConfirmed({
        title: `Day ${nextCheckinDay} Proof Anchored On-Chain`,
        signature: txRes.signature,
        solscanUrl: txRes.solscanUrl,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to submit daily proof.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSlashQuitter = async (targetWalletPubkey: string, missedDay: number, name: string) => {
    setActionError(null);
    setBusyAction(`slash-${targetWalletPubkey}`);
    try {
      const txRes = isSoloPool
        ? await executeSlashSoloChallengeDayTx({
            wallet,
            poolId: pool.id,
            creatorPubkey: pool.creatorPubkey,
            poolNumericId: pool.poolNumericId,
            tokenSymbol: pool.tokenSymbol,
            dayIndex: missedDay,
            treasuryWallet,
          })
        : await executeMarkQuitterSlashedTx({
            wallet,
            poolId: pool.id,
            creatorPubkey: pool.creatorPubkey,
            poolNumericId: pool.poolNumericId,
            targetWalletPubkey,
            dayIndex: missedDay,
          });

      const resp = await fetch(`/api/step-stake/pools/${encodeURIComponent(pool.id)}/slash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetWalletPubkey,
          dayIndex: missedDay,
          slashTxSignature: txRes.signature,
        }),
      });
      const data = (await resp.json()) as { pool?: StepStakePool; error?: string };
      if (!resp.ok || !data.pool) {
        throw new Error(data.error || 'Slash crank failed to sync.');
      }
      onPoolUpdated(data.pool);
      onTxConfirmed({
        title: isSoloPool
          ? pool.durationDays === 1
            ? `Settled Solo Miss (50% Treasury · 50% Returned)`
            : `Settled Solo Day ${missedDay} Miss ($${pool.dailyPrincipal.toFixed(2)} ${pool.tokenSymbol} to Treasury)`
          : `Slashed ${name} (+$${pool.stakeAmount} ${pool.tokenSymbol} to Bonus Pot)`,
        signature: txRes.signature,
        solscanUrl: txRes.solscanUrl,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to execute slash settlement.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSettleAndClaim = async (dayToClaim?: number) => {
    setActionError(null);
    setBusyAction('claim');
    try {
      const claimBreakdown = dayToClaim
        ? calculateDailyPayoutBreakdown({
            totalStake: pool.stakeAmount,
            totalDays: pool.durationDays,
            token: pool.tokenSymbol,
            visibility: pool.visibility,
            dayIndex: dayToClaim,
          })
        : null;
      const estimatedAmount = dayToClaim
        ? Number(
            (
              (claimBreakdown?.principalForDay ?? pool.dailyPrincipal) +
              (dayToClaim === pool.durationDays ? projectedBonusShare : 0)
            ).toFixed(2)
          )
        : projectedTotalPayout;

      const txRes = await executeSettleAndClaimTx({
        wallet,
        poolId: pool.id,
        creatorPubkey: pool.creatorPubkey,
        poolNumericId: pool.poolNumericId,
        tokenSymbol: pool.tokenSymbol,
        estimatedPayout: estimatedAmount,
        dayIndex: dayToClaim,
        totalDays: pool.durationDays,
      });

      const resp = await fetch(`/api/step-stake/pools/${encodeURIComponent(pool.id)}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey: wallet.publicKey,
          claimTxSignature: txRes.signature,
          ...(dayToClaim ? { dayIndex: dayToClaim } : {}),
        }),
      });
      const data = (await resp.json()) as {
        pool?: StepStakePool;
        payout?: number;
        claimReceipt?: StepStakeDailyClaimReceipt;
        payoutTxSignature?: string | null;
        payoutSolscanUrl?: string | null;
        payoutStatus?: string;
        payoutDetail?: string;
        error?: string;
      };
      if (!resp.ok || !data.pool) {
        throw new Error(data.error || 'Unable to finalize claim.');
      }
      onPoolUpdated(data.pool);
      const payoutSig = data.payoutTxSignature || data.claimReceipt?.payoutTxSignature || null;
      const payoutUrl = data.payoutSolscanUrl || data.claimReceipt?.payoutSolscanUrl || null;
      const payoutDetail =
        data.payoutDetail ||
        data.claimReceipt?.payoutDetail ||
        (payoutSig
          ? 'Escrow payout disbursed on-chain to your wallet.'
          : data.payoutStatus === 'claim_verified_escrow_unconfigured'
            ? 'Claim verified on-chain (configure ACTAKE_ESCROW_SECRET_KEY for automatic escrow payout).'
            : undefined);

      onTxConfirmed({
        title: dayToClaim
          ? `Claimed Day ${dayToClaim}/${pool.durationDays} · +$${(data.payout ?? estimatedAmount).toFixed(2)} ${pool.tokenSymbol}`
          : `Claimed +$${(data.payout ?? estimatedAmount).toFixed(2)} ${pool.tokenSymbol}`,
        signature: txRes.signature,
        solscanUrl: txRes.solscanUrl,
        payoutSignature: payoutSig,
        payoutSolscanUrl: payoutUrl,
        payoutDetail,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to settle and claim payout.');
    } finally {
      setBusyAction(null);
    }
  };

  const TrackIcon = pool.category === 0 ? Footprints : pool.category === 1 ? Dumbbell : BookOpen;

  return (
    <div className="space-y-5">
      {/* Top Hero Summary Card */}
      <div className="rounded-[26px] bg-[#141418] text-white p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/65">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  isSoloPool
                    ? 'bg-white/15 text-white'
                    : 'bg-[#F16A2E]/25 text-[#FFB48F]'
                }`}
              >
                {isSoloPool ? (
                  <>
                    <Lock className="w-3 h-3" />
                    <span>Private Solo</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3" />
                    <span>Public Community · Explore</span>
                  </>
                )}
              </span>
              <TrackIcon className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>{trackMeta.label}</span>
              <span aria-hidden="true">·</span>
              <span>
                Day {elapsedDays} of {pool.durationDays}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {pool.tokenSymbol}
                {pool.skrMultiplierBps > 10000
                  ? ` (${(pool.skrMultiplierBps / 10000).toFixed(1)}x SKR Weight)`
                  : ''}
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
              {pool.title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/60">
              <span>
                Daily Goal:{' '}
                <strong className="text-white font-mono tabular-nums">
                  {pool.targetMetric.toLocaleString()} {trackMeta.unitShort}
                </strong>
              </span>
              <a
                href={getSolscanTxUrl(pool.createTxSignature)}
                target="_blank"
                rel="noreferrer"
                className="text-[#F16A2E] hover:underline inline-flex items-center gap-1 font-semibold"
              >
                <span>Pool Creation Tx on Solscan</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={getSolscanAccountUrl(pool.vaultPda)}
                target="_blank"
                rel="noreferrer"
                className="text-white/75 hover:text-white inline-flex items-center gap-1 font-mono text-[11px]"
              >
                <span>Vault PDA: {pool.vaultPda.slice(0, 6)}...{pool.vaultPda.slice(-4)}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Live Countdown to Midnight Cutoff */}
          <div className="rounded-2xl bg-white/[0.07] border border-white/10 px-4 py-3 sm:text-right shrink-0">
            <div className="text-[11px] text-white/60 inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>{isPoolCompleted ? 'Pool Completed' : 'Midnight Cutoff In'}</span>
            </div>
            <div className="font-mono text-2xl font-extrabold text-white tabular-nums mt-0.5">
              {isPoolCompleted ? 'SETTLE NOW' : formatCountdown(midnightCountdownSec)}
            </div>
          </div>
        </div>

        {/* 4 Key Pool Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          <div className="rounded-2xl bg-white/[0.06] p-3.5">
            <div className="text-[11px] text-white/60">Total Stake</div>
            <div className="font-display text-xl font-extrabold mt-0.5">
              ${pool.stakeAmount}{' '}
              <span className="text-xs font-mono text-white/70">{pool.tokenSymbol}</span>
            </div>
          </div>
          <div className="rounded-2xl bg-white/[0.06] p-3.5">
            <div className="text-[11px] text-white/60">Daily Split Unlock</div>
            <div className="font-display text-xl font-extrabold text-[#4ADE80] mt-0.5">
              ${pool.dailyPrincipal.toFixed(2)}{' '}
              <span className="text-xs font-mono text-white/70">/day</span>
            </div>
          </div>
          <div className="rounded-2xl bg-white/[0.06] p-3.5">
            <div className="text-[11px] text-white/60">
              {isSoloPool ? 'Cycle Length' : 'Survivors / Total'}
            </div>
            <div className="font-display text-xl font-extrabold mt-0.5">
              {isSoloPool
                ? pool.durationDays === 1
                  ? 'Once (1d)'
                  : `${pool.durationDays} Days`
                : `${pool.activeParticipants} / ${pool.totalParticipants}`}
            </div>
          </div>
          <div className="rounded-2xl bg-white/[0.06] p-3.5">
            <div className="text-[11px] text-white/60">
              {isSoloPool ? 'Solo Miss Rule' : 'Forfeited Bonus Pot'}
            </div>
            <div className="font-display text-xl font-extrabold text-[#F16A2E] mt-0.5">
              {isSoloPool ? (
                <span className="text-sm font-bold">
                  {pool.durationDays === 1 ? '50% Treasury / 50% Back' : 'Daily Ratio Only'}
                </span>
              ) : (
                <>
                  +${pool.forfeitedVaultBalance.toFixed(2)}{' '}
                  <span className="text-xs font-mono text-white/70">{pool.tokenSymbol}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs font-medium text-[#DC2626] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* 2-Column Split: Daily Metric Collector & Action Panel | Leaderboard & Solscan Receipts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Enroll OR Track Proof Collector */}
        <div className="lg:col-span-5 actake-card p-5 space-y-4">
          {!currentParticipant ? (
            isSoloPool && pool.creatorPubkey !== wallet.publicKey ? (
              <div className="space-y-2.5">
                <div className="inline-flex items-center gap-2 text-sm font-bold text-[#111114]">
                  <Lock className="w-4 h-4 text-[#F16A2E]" />
                  <span>Private Solo Track Pool</span>
                </div>
                <p className="text-xs text-[#6B6663] leading-relaxed">
                  Only the creator wallet can stake and check into a private Solo pool.
                </p>
              </div>
            ) : (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-lg font-extrabold text-[#111114]">
                  Join &amp; Stake in This Pool
                </h3>
                <p className="text-xs text-[#6B6663] mt-1 leading-relaxed">
                  Lock ${pool.stakeAmount} {pool.tokenSymbol} into the pool escrow vault. Hit{' '}
                  {pool.targetMetric.toLocaleString()} {trackMeta.unitShort} daily to unlock $
                  {pool.dailyPrincipal.toFixed(2)}/day
                  {isSoloPool ? '.' : ' and split the forfeited quitter pot.'}
                </p>
              </div>

              <label className="flex items-start gap-2.5 rounded-2xl bg-[#FAF7F3] border border-[#EFE2D9] p-3 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={optInSeamlessOnJoin}
                  onChange={(e) => setOptInSeamlessOnJoin(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#F16A2E]"
                />
                <span className="text-[#4B4744]">
                  <strong className="text-[#111114]">Opt-in Seamless Midnight Key:</strong>{' '}
                  Authorize a scoped daily check-in session key (zero withdrawal power). Default uses
                  a 23:15 Seed Vault MWA tap.
                </span>
              </label>

              <button
                type="button"
                disabled={busyAction !== null || isPoolCompleted}
                onClick={() => void handleJoinAndStake()}
                className="w-full min-h-[48px] px-5 rounded-full bg-[#141418] hover:bg-[#F16A2E] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {busyAction === 'join' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing Stake Transaction...</span>
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4" />
                    <span>
                      Join &amp; Stake ${pool.stakeAmount} {pool.tokenSymbol}
                    </span>
                  </>
                )}
              </button>
            </div>
            )
          ) : currentParticipant.isEliminated ? (
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-sm font-bold text-[#DC2626]">
                <XCircle className="w-5 h-5" />
                <span>Eliminated — Stake Forfeited</span>
              </div>
              <p className="text-xs text-[#6B6663] leading-relaxed">
                Your ${pool.stakeAmount} {pool.tokenSymbol} stake was moved to the forfeited bonus
                pot for surviving participants.
              </p>
              {currentParticipant.slashTxSignature && (
                <a
                  href={getSolscanTxUrl(currentParticipant.slashTxSignature)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F16A2E] hover:underline"
                >
                  <span>Verify Slash on Solscan</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Today's Metric Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-[#6B6663]">
                      Today&apos;s Progress · Day {Math.min(pool.durationDays, nextCheckinDay)}
                    </div>
                    <div className="font-display text-2xl font-extrabold text-[#111114] tabular-nums">
                      {todayMetricValue.toLocaleString()}{' '}
                      <span className="text-sm font-semibold text-[#6B6663]">
                        / {pool.targetMetric.toLocaleString()} {trackMeta.unitShort}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-extrabold text-[#F16A2E] tabular-nums">
                    {progressPct}%
                  </span>
                </div>

                <div className="h-3 w-full rounded-full bg-[#F2E7E0] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#F16A2E] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Track-Specific Live Collector */}
              {pool.category === 0 && (
                <div className="rounded-2xl bg-[#FAF7F3] border border-[#EFE2D9] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#111114]">
                    <Smartphone className="w-4 h-4 text-[#F16A2E]" />
                    <span>Hardware Step Sensor Bridge</span>
                  </div>
                  {nativeStepsAvailable ? (
                    <button
                      type="button"
                      onClick={() => void handleStartStepsHardware()}
                      className="w-full min-h-[44px] px-4 rounded-xl bg-[#141418] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <Footprints className="w-4 h-4" />
                      <span>Sync Android StepCounterBridge Proof</span>
                    </button>
                  ) : (
                    <div className="space-y-2 text-xs text-[#6B6663] leading-relaxed">
                      <p>
                        Hardware step proofs use Android&apos;s tamper-resistant{' '}
                        <strong className="text-[#111114]">TYPE_STEP_COUNTER</strong> sensor inside
                        the Actake Android / Solana Seeker APK (Capacitor{' '}
                        <code className="font-mono text-[11px]">StepCounterBridge</code> +{' '}
                        <code className="font-mono text-[11px]">MidnightCheckinWorker</code>).
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleStartStepsHardware()}
                        className="w-full min-h-[44px] px-4 rounded-xl bg-white border border-[#EFE2D9] hover:border-[#F16A2E] text-xs font-bold text-[#111114]"
                      >
                        Check Native Sensor Status
                      </button>
                    </div>
                  )}
                  {nativeStepNotice && (
                    <div className="text-[11px] text-[#6B6663]">{nativeStepNotice}</div>
                  )}
                </div>
              )}

              {pool.category === 1 && (
                <div className="rounded-2xl bg-[#FAF7F3] border border-[#EFE2D9] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#111114] inline-flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#F16A2E]" />
                      <span>{pool.gymLocationName || 'Gym 150m Geofence'}</span>
                    </span>
                    <span className="font-mono font-bold text-[#6B6663] tabular-nums">
                      {gymState.currentDistanceMeters !== null
                        ? `${gymState.currentDistanceMeters}m away`
                        : 'GPS Idle'}
                    </span>
                  </div>
                  <div className="text-xs text-[#6B6663] tabular-nums">
                    Dwell time inside 150m:{' '}
                    <strong className="font-mono text-[#111114]">
                      {Math.floor(gymState.verifiedDwellSeconds / 60)}m{' '}
                      {gymState.verifiedDwellSeconds % 60}s
                    </strong>{' '}
                    · {gymState.samples.filter((s) => s.insideZone).length} GPS samples
                  </div>
                  {gymState.error && (
                    <div className="text-xs text-[#DC2626]">{gymState.error}</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleToggleGymWatcher}
                      className={`flex-1 min-h-[44px] px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                        gymState.active
                          ? 'bg-[#DC2626] text-white'
                          : 'bg-[#141418] hover:bg-[#F16A2E] text-white'
                      }`}
                    >
                      {gymState.active ? (
                        <>
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop GPS Dwell</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Start Gym GPS Check</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={gymState.verifiedMinutes < pool.targetMetric}
                      onClick={() => void handleFinalizeGymProof()}
                      className="min-h-[44px] px-4 rounded-xl bg-white border border-[#EFE2D9] hover:border-[#F16A2E] text-xs font-bold text-[#111114] disabled:opacity-45"
                    >
                      Hash Proof
                    </button>
                  </div>
                </div>
              )}

              {pool.category === 2 && (
                <div className="rounded-2xl bg-[#FAF7F3] border border-[#EFE2D9] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#111114] inline-flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-[#F16A2E]" />
                      <span>Web Worker Focus Session</span>
                    </span>
                    <span className="font-mono font-bold text-[#111114] tabular-nums">
                      {formatCountdown(studyState.elapsedSeconds)}
                    </span>
                  </div>
                  <div className="text-xs text-[#6B6663] tabular-nums">
                    Heartbeats: <strong className="text-[#111114]">{studyState.heartbeats.length}</strong>{' '}
                    · Tab switches:{' '}
                    <strong
                      className={
                        studyState.interruptions > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'
                      }
                    >
                      {studyState.interruptions}
                    </strong>
                    {studyState.pausedByTabSwitch ? ' · Paused (return to tab)' : ''}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleToggleStudySession}
                      className={`flex-1 min-h-[44px] px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                        studyState.active
                          ? 'bg-[#DC2626] text-white'
                          : 'bg-[#141418] hover:bg-[#F16A2E] text-white'
                      }`}
                    >
                      {studyState.active ? (
                        <>
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop Focus Timer</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Start Study Focus</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={studyState.focusedMinutes < pool.targetMetric}
                      onClick={() => void handleFinalizeStudyProof()}
                      className="min-h-[44px] px-4 rounded-xl bg-white border border-[#EFE2D9] hover:border-[#F16A2E] text-xs font-bold text-[#111114] disabled:opacity-45"
                    >
                      Hash Proof
                    </button>
                  </div>
                </div>
              )}

              {/* Generated Proof Hash Preview */}
              {readyProof && (
                <div className="rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] p-3.5 space-y-1.5 text-xs">
                  <div className="font-bold text-[#16A34A] inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      SHA-256 Proof Ready ({readyProof.metricAchieved.toLocaleString()}{' '}
                      {trackMeta.unitShort})
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-[#111114] break-all">
                    {readyProof.proofHash}
                  </div>
                </div>
              )}

              {/* Per-Day Split Claim CTA (Unlocked immediately after each verified day) */}
              {nextClaimableDay !== null && nextClaimBreakdown && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleSettleAndClaim(nextClaimableDay)}
                  className="w-full min-h-[48px] px-5 rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {busyAction === 'claim' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing Daily Claim on Solana...</span>
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4" />
                      <span>
                        Claim Day {nextClaimableDay}/{pool.durationDays} ($
                        {(
                          nextClaimBreakdown.principalForDay +
                          (nextClaimableDay === pool.durationDays ? projectedBonusShare : 0)
                        ).toFixed(2)}{' '}
                        {pool.tokenSymbol})
                      </span>
                    </>
                  )}
                </button>
              )}

              {/* Primary Sign & Submit Daily Proof OR Final Settle & Claim */}
              {isPoolCompleted && nextClaimableDay === null ? (
                <button
                  type="button"
                  disabled={busyAction !== null || currentParticipant.hasClaimed}
                  onClick={() => void handleSettleAndClaim()}
                  className="w-full min-h-[48px] px-5 rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {busyAction === 'claim' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Settling Payout...</span>
                    </>
                  ) : currentParticipant.hasClaimed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>All Payouts Claimed</span>
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4" />
                      <span>
                        Settle &amp; Claim ${projectedTotalPayout.toFixed(2)} {pool.tokenSymbol}
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={
                    busyAction !== null ||
                    !readyProof ||
                    currentParticipant.daysCompleted >= pool.durationDays
                  }
                  onClick={() => void handleSubmitProofOnChain()}
                  className="w-full min-h-[48px] px-5 rounded-full bg-[#F16A2E] hover:bg-[#D95922] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-45"
                >
                  {busyAction === 'checkin' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Anchoring Proof on Solana...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {currentParticipant.daysCompleted >= pool.durationDays
                          ? 'All Days Verified'
                          : `Sign & Submit Day ${nextCheckinDay} Proof`}
                      </span>
                    </>
                  )}
                </button>
              )}

              {/* Claimed Daily Payout Receipts (Dual Claim Tx + Escrow Payout Tx) */}
              {currentParticipant.claimedDays && currentParticipant.claimedDays.length > 0 && (
                <div className="rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] p-3.5 space-y-2 text-xs">
                  <div className="font-bold text-[#16A34A] flex items-center justify-between gap-2">
                    <span>Claimed Daily Payouts</span>
                    <span className="font-mono tabular-nums">
                      {currentParticipant.claimedDays.length}/{pool.durationDays} days
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {currentParticipant.claimedDays.map((receipt) => (
                      <div
                        key={receipt.dayIndex}
                        className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#111114]"
                      >
                        <span className="font-mono font-semibold tabular-nums">
                          Day {receipt.dayIndex}: +${receipt.totalPayout.toFixed(2)} {pool.tokenSymbol}
                        </span>
                        <div className="flex items-center gap-2">
                          <a
                            href={receipt.claimSolscanUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                          >
                            <span>Claim Tx</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {receipt.payoutSolscanUrl && (
                            <a
                              href={receipt.payoutSolscanUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-[#16A34A] hover:underline inline-flex items-center gap-1"
                            >
                              <span>Escrow Payout</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentParticipant.sessionDelegatePubkey && (
                <div className="text-[11px] text-[#6B6663] inline-flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#F16A2E]" />
                  <span>
                    Scoped midnight session delegate active:{' '}
                    <code className="font-mono">
                      {currentParticipant.sessionDelegatePubkey.slice(0, 6)}...
                    </code>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Active vs. Slashed Leaderboard + Permissionless Slash Crank + Solscan Proofs */}
        <div className="lg:col-span-7 space-y-5">
          {/* Overdue Missed-Day Settlement: Public Quitter Slash Crank OR Solo Missed-Day Settlement */}
          {overdueParticipants.length > 0 && (
            <div className="rounded-2xl bg-[#FFF3EC] border border-[#F6C8B0] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-[#9A3412] inline-flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[#F16A2E]" />
                    <span>
                      {isSoloPool
                        ? 'Solo Missed-Day Settlement'
                        : 'Permissionless Slash Crank Available'}
                    </span>
                  </div>
                  <p className="text-xs text-[#7C2D12] mt-0.5">
                    {isSoloPool
                      ? pool.durationDays === 1
                        ? `You missed this one-time Solo target. Settling sends 50% ($${(pool.stakeAmount * 0.5).toFixed(2)} ${pool.tokenSymbol}) to Actake Treasury and returns 50% to your wallet.`
                        : `Only the missed day's $${pool.dailyPrincipal.toFixed(2)} ${pool.tokenSymbol} share is slashed to Actake Treasury—your remaining days stay protected in escrow.`
                      : `Anyone can mark overdue participants slashed on-chain to transfer their $${pool.stakeAmount} ${pool.tokenSymbol} into the survivor bonus pot.`}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {overdueParticipants.map(({ participant, missedDay }) => (
                  <div
                    key={participant.walletPubkey}
                    className="rounded-xl bg-white border border-[#EFE2D9] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="text-xs">
                      <strong className="text-[#111114]">{participant.displayName}</strong>{' '}
                      <span className="text-[#6B6663]">
                        missed Day {missedDay} deadline · Last proof Day {participant.lastCheckinDay}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void handleSlashQuitter(
                          participant.walletPubkey,
                          missedDay,
                          participant.displayName
                        )
                      }
                      className="min-h-[38px] px-3.5 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                    >
                      {busyAction === `slash-${participant.walletPubkey}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isSoloPool
                          ? pool.durationDays === 1
                            ? 'Settle 50 / 50 Miss'
                            : `Settle Day ${missedDay} (-$${pool.dailyPrincipal.toFixed(2)})`
                          : `Slash Quitter (+$${pool.stakeAmount})`}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active vs. Slashed Participant Leaderboard */}
          <div className="actake-card p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2">
                <Users className="w-4 h-4 text-[#F16A2E]" />
                <h3 className="font-display text-base font-extrabold text-[#111114]">
                  Active vs. Slashed Leaderboard
                </h3>
              </div>
              <span className="text-xs text-[#6B6663] tabular-nums">
                {pool.activeParticipants} active · {pool.totalParticipants - pool.activeParticipants}{' '}
                slashed
              </span>
            </div>

            <div className="divide-y divide-[#F4ECE7]">
              {[...pool.participants]
                .sort((a, b) => {
                  if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
                  return b.daysCompleted - a.daysCompleted;
                })
                .map((member) => {
                  const isYou = member.walletPubkey === wallet.publicKey;
                  return (
                    <div
                      key={member.walletPubkey}
                      className="py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                            member.isEliminated
                              ? 'bg-[#FEF2F2] text-[#DC2626]'
                              : isYou
                                ? 'bg-[#141418] text-white'
                                : 'bg-[#FFF3EC] text-[#F16A2E]'
                          }`}
                        >
                          {member.initials}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#111114] truncate">
                            {isYou ? `${member.displayName} (You)` : member.displayName}
                          </div>
                          <div className="text-xs text-[#6B6663] tabular-nums">
                            {member.isEliminated ? (
                              <span className="text-[#DC2626] font-semibold">
                                Slashed · Forfeited ${pool.stakeAmount} {pool.tokenSymbol}
                              </span>
                            ) : (
                              <span className="text-[#16A34A] font-semibold">
                                Active · {member.daysCompleted}/{pool.durationDays} days verified
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <a
                          href={getSolscanTxUrl(
                            member.claimTxSignature ||
                              member.slashTxSignature ||
                              member.stakeTxSignature
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Verify on Solscan</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Daily Check-In Proofs Feed (Every row linked to Solscan) */}
          <div className="actake-card p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-extrabold text-[#111114]">
                Verified Daily On-Chain Proofs
              </h3>
              <span className="text-xs text-[#6B6663] tabular-nums">
                {pool.checkins.length} proof{pool.checkins.length === 1 ? '' : 's'}
              </span>
            </div>

            {pool.checkins.length === 0 ? (
              <p className="text-xs text-[#6B6663]">
                No daily proofs anchored yet. Complete today&apos;s {trackMeta.label.toLowerCase()}{' '}
                target to record the first SHA-256 proof on Solscan.
              </p>
            ) : (
              <div className="divide-y divide-[#F4ECE7]">
                {pool.checkins.map((chk) => (
                  <div
                    key={chk.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-bold text-[#111114] tabular-nums">
                        {chk.displayName} · Day {chk.dayIndex} ·{' '}
                        <span className="text-[#16A34A]">
                          {chk.metricAchieved.toLocaleString()} {trackMeta.unitShort}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-[#877F7A] truncate">
                        SHA-256: {chk.proofHash.slice(0, 20)}...{chk.proofHash.slice(-8)}
                      </div>
                    </div>
                    <a
                      href={getSolscanTxUrl(chk.txSignature)}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[36px] inline-flex items-center gap-1.5 text-xs font-bold text-[#F16A2E] hover:underline shrink-0"
                    >
                      <span>Verify on Solscan</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
