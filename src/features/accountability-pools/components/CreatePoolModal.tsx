import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Crosshair,
  Dumbbell,
  Footprints,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { TokenType, WalletSession } from '../../../types/actake';
import {
  calculateDailyPayoutBreakdown,
  clampRecurringDays,
} from '../../../utils/stakePayouts';
import {
  ACCOUNTABILITY_TRACKS,
  type AccountabilityTrackCategory,
  type StepStakePool,
  type StepStakeVisibility,
} from '../types';
import {
  createScopedEphemeralSessionKey,
  executeCreateChallengePoolTx,
} from '../walletClient';
import { syncEphemeralSessionKeyToNative } from '../trackers/stepsTracker';

interface CreatePoolModalProps {
  open: boolean;
  wallet: WalletSession;
  escrowWallet?: string | null;
  treasuryWallet?: string | null;
  initialVisibility?: StepStakeVisibility;
  onClose: () => void;
  onPoolCreated: (pool: StepStakePool, solscanUrl: string, signature: string) => void;
}

const STAKE_PRESETS = [1, 5, 10, 25, 50, 100];
const DURATION_PRESETS = [1, 3, 7, 8, 14, 30];

export const CreatePoolModal: React.FC<CreatePoolModalProps> = ({
  open,
  wallet,
  escrowWallet = null,
  treasuryWallet = null,
  initialVisibility = 'solo',
  onClose,
  onPoolCreated,
}) => {
  const [visibility, setVisibility] = useState<StepStakeVisibility>(initialVisibility);
  const [category, setCategory] = useState<AccountabilityTrackCategory>(0);
  const [title, setTitle] = useState('Morning 8,000 Steps Sprint');
  const [tokenSymbol, setTokenSymbol] = useState<TokenType>('SKR');
  const [stakeAmount, setStakeAmount] = useState<number>(10);
  const [targetMetric, setTargetMetric] = useState<number>(8000);
  const [durationDays, setDurationDays] = useState<number>(7);
  const [gymLocationName, setGymLocationName] = useState('Foundry Athletics Club');
  const [gymLat, setGymLat] = useState<string>('37.7897');
  const [gymLng, setGymLng] = useState<string>('-122.4014');
  const [locatingGym, setLocatingGym] = useState(false);
  const [enableSeamlessKey, setEnableSeamlessKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVisibility(initialVisibility);
      setError(null);
    }
  }, [open, initialVisibility]);

  if (!open) return null;

  const trackMeta = ACCOUNTABILITY_TRACKS[category];
  const skrMultiplierBps = tokenSymbol === 'SKR' ? 12000 : 10000;
  const payoutBreakdown = calculateDailyPayoutBreakdown({
    totalStake: Number.isFinite(stakeAmount) ? stakeAmount : 0,
    totalDays: durationDays,
    token: tokenSymbol,
    visibility,
  });

  const handleSelectTrack = (next: AccountabilityTrackCategory) => {
    setCategory(next);
    const meta = ACCOUNTABILITY_TRACKS[next];
    setTargetMetric(meta.defaultTarget);
    if (next === 0) setTitle('Morning 8,000 Steps Sprint');
    if (next === 1) setTitle('45-Min Gym Consistency Club');
    if (next === 2) setTitle('60-Min Deep Study Focus Pool');
    setError(null);
  };

  const handleUseCurrentGymLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is unavailable in this browser.');
      return;
    }
    setLocatingGym(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGymLat(pos.coords.latitude.toFixed(5));
        setGymLng(pos.coords.longitude.toFixed(5));
        setLocatingGym(false);
      },
      (geoErr) => {
        setError(geoErr.message || 'Could not acquire GPS coordinates.');
        setLocatingGym(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      setError('Enter a pool title with at least 3 characters.');
      return;
    }
    if (!Number.isFinite(stakeAmount) || stakeAmount < 1 || stakeAmount > 1_000_000) {
      setError('Stake amount must be at least $1.');
      return;
    }
    const clampedDays = clampRecurringDays(durationDays);
    if (
      !Number.isFinite(targetMetric) ||
      targetMetric < trackMeta.minTarget ||
      targetMetric > trackMeta.maxTarget
    ) {
      setError(
        `Daily target must be between ${trackMeta.minTarget.toLocaleString()} and ${trackMeta.maxTarget.toLocaleString()} ${trackMeta.unitShort}.`
      );
      return;
    }

    let parsedLat: number | null = null;
    let parsedLng: number | null = null;
    if (category === 1) {
      parsedLat = Number(gymLat);
      parsedLng = Number(gymLng);
      if (
        !Number.isFinite(parsedLat) ||
        !Number.isFinite(parsedLng) ||
        Math.abs(parsedLat) > 90 ||
        Math.abs(parsedLng) > 180
      ) {
        setError('Enter valid gym latitude (-90..90) and longitude (-180..180).');
        return;
      }
    }

    setSubmitting(true);
    try {
      const poolNumericId = Math.floor(Date.now() / 1000);
      let delegatePubkey: string | null = null;
      if (enableSeamlessKey) {
        const tempPoolKey = `pending-${poolNumericId}`;
        const bundle = await createScopedEphemeralSessionKey(tempPoolKey, clampedDays);
        delegatePubkey = bundle.delegatePubkey;
        await syncEphemeralSessionKeyToNative({
          delegatePubkey: bundle.delegatePubkey,
          expiresAtMs: bundle.expiresAtMs,
        });
      }

      const txRes = await executeCreateChallengePoolTx({
        wallet,
        poolNumericId,
        category,
        visibility,
        tokenSymbol,
        stakeAmount,
        targetMetric,
        durationDays: clampedDays,
        skrMultiplierBps,
        title: trimmedTitle,
        escrowWallet,
        treasuryWallet,
        autoJoinCreator: true,
        sessionDelegatePubkey: delegatePubkey,
      });

      const resp = await fetch('/api/step-stake/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          visibility,
          creatorPubkey: wallet.publicKey,
          creatorDisplayName: wallet.username
            ? `@${wallet.username}`
            : wallet.walletName || undefined,
          category,
          tokenSymbol,
          stakeAmount,
          targetMetric,
          durationDays: clampedDays,
          skrMultiplierBps,
          gymLocationName: category === 1 ? gymLocationName.trim() || 'Target Gym' : null,
          gymLat: parsedLat,
          gymLng: parsedLng,
          poolNumericId,
          poolPda: txRes.poolPda,
          vaultPda: txRes.vaultPda,
          createTxSignature: txRes.signature,
          onchainMode: txRes.onchainMode,
          autoJoinCreator: true,
          creatorSessionDelegate: delegatePubkey,
        }),
      });

      const data = (await resp.json()) as { pool?: StepStakePool; error?: string };
      if (!resp.ok || !data.pool) {
        throw new Error(data.error || 'Pool creation transaction succeeded, but sync failed.');
      }

      onPoolCreated(data.pool, txRes.solscanUrl, txRes.signature);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create accountability pool.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-step-stake-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[#111114]/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-t-[28px] sm:rounded-[28px] bg-[#FAF7F3] border border-[#EFE2D9] shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#FAF7F3]/95 backdrop-blur-md border-b border-[#EFE2D9] px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#F16A2E]">
              {visibility === 'community'
                ? 'Public Community Track Pool · Listed on Explore'
                : 'Private Solo Track Commitment'}
            </div>
            <h2
              id="create-step-stake-modal-title"
              className="font-display text-xl font-extrabold text-[#111114]"
            >
              {visibility === 'community' ? 'Create Public Track Pool' : 'Create Solo Track Pool'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close create pool modal"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-white border border-[#EFE2D9] hover:border-[#F16A2E] text-[#111114] flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 0. Audience / Visibility Switcher (Matches Habit Stake: Solo default -> Public Community opt-in) */}
          <div className="rounded-2xl bg-white border border-[#EFE2D9] p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-sm font-extrabold text-[#111114]">
                  Who Can Join This Pool?
                </div>
                <p className="text-xs text-[#6B6663] mt-0.5">
                  {visibility === 'community'
                    ? 'Listed publicly on Explore — anyone can see the stake, cycle length, and join.'
                    : 'Private solo pool by default. Switch to Public Community to list it on Explore.'}
                </p>
              </div>
              <div
                role="radiogroup"
                aria-label="Track pool visibility"
                className="inline-flex items-center p-1 rounded-full bg-[#FFF4EE] border border-[#F2E3DA] self-start sm:self-auto shrink-0"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={visibility === 'solo'}
                  onClick={() => setVisibility('solo')}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    visibility === 'solo'
                      ? 'bg-[#111114] text-white shadow-xs'
                      : 'text-[#6B6663] hover:text-[#111114]'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Solo</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={visibility === 'community'}
                  onClick={() => setVisibility('community')}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    visibility === 'community'
                      ? 'bg-[#F16A2E] text-white shadow-xs'
                      : 'text-[#6B6663] hover:text-[#111114]'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>Public Community</span>
                </button>
              </div>
            </div>

            {visibility === 'community' && (
              <div className="pt-2.5 border-t border-[#F4ECE7] flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6B6663] tabular-nums">
                <Users className="w-3.5 h-3.5 text-[#F16A2E] shrink-0" />
                <span>Explore preview:</span>
                <span className="font-mono font-bold text-[#111114]">
                  ${Number.isFinite(stakeAmount) && stakeAmount >= 1 ? stakeAmount.toFixed(2) : '0.00'}{' '}
                  {tokenSymbol} buy-in
                </span>
                <span aria-hidden="true">·</span>
                <span>{durationDays === 1 ? 'Once (1d)' : `${durationDays}d cycle`}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-[#16A34A]">
                  ${payoutBreakdown.baseDailyPrincipal.toFixed(2)}/day unlock
                </span>
              </div>
            )}
          </div>

          {/* 1. Track Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#111114]">Verification Track</label>
            <div className="grid grid-cols-3 gap-2.5">
              {([0, 1, 2] as AccountabilityTrackCategory[]).map((cat) => {
                const meta = ACCOUNTABILITY_TRACKS[cat];
                const active = category === cat;
                const Icon = cat === 0 ? Footprints : cat === 1 ? Dumbbell : BookOpen;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSelectTrack(cat)}
                    className={`min-h-[68px] p-3 rounded-2xl border text-left transition-colors flex flex-col justify-between gap-1.5 ${
                      active
                        ? 'bg-[#141418] border-[#141418] text-white'
                        : 'bg-white border-[#EFE2D9] hover:border-[#F16A2E] text-[#111114]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? 'text-[#F16A2E]' : 'text-[#6B6663]'}`} />
                    <span className="text-xs font-bold leading-tight">{meta.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[#6B6663]">{trackMeta.description}</p>
          </div>

          {/* 2. Pool Name */}
          <div className="space-y-1.5">
            <label htmlFor="pool-title-input" className="text-xs font-bold text-[#111114]">
              Pool Title
            </label>
            <input
              id="pool-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={72}
              placeholder="e.g. Seeker 10k Daily Steps Club"
              className="w-full min-h-[46px] px-4 rounded-2xl bg-white border border-[#EFE2D9] focus:border-[#F16A2E] focus:outline-none text-sm text-[#111114]"
            />
          </div>

          {/* 3. Token Selector (USDC vs SKR with 1.2x Yield Weight) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-[#111114]">Stake Token</label>
              <span className="text-xs font-semibold text-[#16A34A]">
                SKR pools unlock 1.2x forfeited pot weight
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {(['SKR', 'USDC'] as TokenType[]).map((sym) => {
                const active = tokenSymbol === sym;
                return (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setTokenSymbol(sym)}
                    className={`min-h-[54px] px-4 py-2.5 rounded-2xl border text-left transition-colors flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-[#141418] border-[#141418] text-white'
                        : 'bg-white border-[#EFE2D9] hover:border-[#F16A2E] text-[#111114]'
                    }`}
                  >
                    <div>
                      <div className="font-display text-sm font-extrabold">{sym}</div>
                      <div className={`text-[11px] ${active ? 'text-white/70' : 'text-[#6B6663]'}`}>
                        {sym === 'SKR' ? '1.2x Multiplier · 0% Fee' : '1.0x Weight · Devnet SPL'}
                      </div>
                    </div>
                    {sym === 'SKR' && (
                      <Sparkles
                        className={`w-4 h-4 shrink-0 ${active ? 'text-[#F16A2E]' : 'text-[#16A34A]'}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Open Stake Amount ($1+) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="stake-amount-input" className="text-xs font-bold text-[#111114]">
                Stake Amount ($1+, no cap)
              </label>
              <span className="font-mono text-xs font-bold text-[#F16A2E] tabular-nums">
                ${Number.isFinite(stakeAmount) ? stakeAmount : 0} {tokenSymbol}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {STAKE_PRESETS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setStakeAmount(amt)}
                  className={`min-h-[42px] px-3.5 rounded-xl text-xs font-mono font-bold tabular-nums transition-colors ${
                    stakeAmount === amt
                      ? 'bg-[#F16A2E] text-white'
                      : 'bg-white border border-[#EFE2D9] text-[#111114] hover:border-[#F16A2E]'
                  }`}
                >
                  ${amt}
                </button>
              ))}
              <input
                id="stake-amount-input"
                type="number"
                min={1}
                max={1000000}
                step={1}
                value={stakeAmount}
                onChange={(e) => setStakeAmount(Number(e.target.value))}
                className="w-24 min-h-[42px] px-3 rounded-xl bg-white border border-[#EFE2D9] focus:border-[#F16A2E] focus:outline-none font-mono text-xs font-bold text-[#111114] tabular-nums"
              />
            </div>
          </div>

          {/* 5. Daily Target & Dynamic Recurring Duration (1–365 days) */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="target-metric-input" className="text-xs font-bold text-[#111114]">
                Daily Target ({trackMeta.unitShort})
              </label>
              <input
                id="target-metric-input"
                type="number"
                min={trackMeta.minTarget}
                max={trackMeta.maxTarget}
                step={trackMeta.stepIncrement}
                value={targetMetric}
                onChange={(e) => setTargetMetric(Number(e.target.value))}
                className="w-full min-h-[44px] px-3.5 rounded-2xl bg-white border border-[#EFE2D9] focus:border-[#F16A2E] focus:outline-none font-mono text-sm font-bold text-[#111114] tabular-nums"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="duration-days-input" className="text-xs font-bold text-[#111114]">
                  Recurring Duration (1–365 days)
                </label>
                <span className="font-mono text-xs font-bold text-[#111114] tabular-nums">
                  {durationDays === 1 ? 'Once (1 day)' : `${durationDays} days`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurationDays(d)}
                    className={`min-h-[40px] px-3 rounded-xl text-xs font-mono font-bold tabular-nums transition-colors ${
                      durationDays === d
                        ? 'bg-[#141418] text-white'
                        : 'bg-white border border-[#EFE2D9] text-[#111114] hover:border-[#F16A2E]'
                    }`}
                  >
                    {d === 1 ? 'Once' : `${d}d`}
                  </button>
                ))}
                <div className="inline-flex items-center rounded-xl bg-white border border-[#EFE2D9] overflow-hidden">
                  <button
                    type="button"
                    aria-label="Decrease days"
                    onClick={() => setDurationDays((d) => clampRecurringDays(d - 1))}
                    className="w-9 h-10 flex items-center justify-center text-[#6B6663] hover:text-[#111114]"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    id="duration-days-input"
                    type="number"
                    min={1}
                    max={365}
                    value={durationDays}
                    onChange={(e) => setDurationDays(clampRecurringDays(Number(e.target.value)))}
                    className="w-14 h-10 text-center font-mono text-xs font-bold text-[#111114] focus:outline-none tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label="Increase days"
                    onClick={() => setDurationDays((d) => clampRecurringDays(d + 1))}
                    className="w-9 h-10 flex items-center justify-center text-[#6B6663] hover:text-[#111114]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Live Split-Evenly Per-Day Payout Preview */}
            <div className="rounded-2xl bg-[#FFF4EE] border border-[#F2E3DA] p-3.5 space-y-1.5 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#111114]">Daily Split Payout Unlock</span>
                <span className="font-mono font-extrabold text-[#16A34A]">
                  ${payoutBreakdown.baseDailyPrincipal.toFixed(2)} {tokenSymbol} / day
                </span>
              </div>
              <p className="text-[11px] text-[#6B6663] leading-relaxed">
                {durationDays === 1
                  ? visibility === 'solo'
                    ? `One-time solo stake: verify to unlock $${payoutBreakdown.baseDailyPrincipal.toFixed(2)} ${tokenSymbol}. If missed, 50% routes to Actake Treasury and 50% refunds to your wallet.`
                    : `One-time public pool: verify to unlock $${payoutBreakdown.baseDailyPrincipal.toFixed(2)} ${tokenSymbol} plus your share of forfeited quitter stakes.`
                  : visibility === 'solo'
                    ? `Your $${Number.isFinite(stakeAmount) ? stakeAmount.toFixed(2) : '0.00'} ${tokenSymbol} stake splits evenly across ${durationDays} days ($${payoutBreakdown.baseDailyPrincipal.toFixed(2)}/day). Missing a day only slashes that day's $${payoutBreakdown.baseDailyPrincipal.toFixed(2)} share.`
                    : `Unlocks $${payoutBreakdown.baseDailyPrincipal.toFixed(2)} ${tokenSymbol} each verified day across ${durationDays} days, plus survivor bonus share from slashed quitters.`}
              </p>
            </div>
          </div>

          {/* 6. Optional Gym Geofence Coordinates */}
          {category === 1 && (
            <div className="rounded-2xl bg-white border border-[#EFE2D9] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#111114]">
                  <MapPin className="w-4 h-4 text-[#F16A2E]" />
                  <span>Gym Location (150m Verification Radius)</span>
                </div>
                <button
                  type="button"
                  disabled={locatingGym}
                  onClick={handleUseCurrentGymLocation}
                  className="min-h-[36px] px-3 rounded-xl bg-[#FAF7F3] border border-[#EFE2D9] hover:border-[#F16A2E] text-[11px] font-bold text-[#111114] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  {locatingGym ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F16A2E]" />
                  ) : (
                    <Crosshair className="w-3.5 h-3.5 text-[#F16A2E]" />
                  )}
                  <span>Use Current GPS</span>
                </button>
              </div>
              <input
                type="text"
                value={gymLocationName}
                onChange={(e) => setGymLocationName(e.target.value)}
                placeholder="Gym name (e.g. Equinox Market St)"
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#FAF7F3] border border-[#EFE2D9] text-xs text-[#111114] focus:border-[#F16A2E] focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={gymLat}
                  onChange={(e) => setGymLat(e.target.value)}
                  placeholder="Latitude"
                  className="min-h-[42px] px-3 rounded-xl bg-[#FAF7F3] border border-[#EFE2D9] font-mono text-xs text-[#111114] tabular-nums"
                />
                <input
                  type="text"
                  value={gymLng}
                  onChange={(e) => setGymLng(e.target.value)}
                  placeholder="Longitude"
                  className="min-h-[42px] px-3 rounded-xl bg-[#FAF7F3] border border-[#EFE2D9] font-mono text-xs text-[#111114] tabular-nums"
                />
              </div>
            </div>
          )}

          {/* 7. Opt-in Scoped Ephemeral Session Key (Android Midnight Worker Seamless Mode) */}
          <label className="flex items-start gap-3 rounded-2xl bg-white border border-[#EFE2D9] p-3.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enableSeamlessKey}
              onChange={(e) => setEnableSeamlessKey(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#F16A2E]"
            />
            <div className="space-y-0.5 text-xs">
              <div className="font-bold text-[#111114] inline-flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#F16A2E]" />
                <span>Authorize Scoped Midnight Check-In Session Key (Optional)</span>
              </div>
              <p className="text-[#6B6663] leading-relaxed">
                Default uses a 23:15 Seed Vault MWA notification tap. Enabling this delegates daily
                proof signing only—the session key can never withdraw or transfer your funds.
              </p>
            </div>
          </label>

          {error && (
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs font-medium text-[#DC2626]">
              {error}
            </div>
          )}

          {/* Primary Submit CTA */}
          <div className="pt-1 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] px-5 rounded-full bg-white border border-[#EFE2D9] hover:border-[#111114] text-xs font-bold text-[#111114]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 sm:flex-initial min-h-[48px] px-6 rounded-full bg-[#141418] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing on Solana...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {visibility === 'community' ? 'Publish & Stake' : 'Lock Solo Stake'} $
                    {Number.isFinite(stakeAmount) ? stakeAmount : 0} {tokenSymbol}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
