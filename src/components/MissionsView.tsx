import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BedDouble,
  BookOpen,
  Clock,
  Coffee,
  Dumbbell,
  Leaf,
  Plus,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import {
  AlarmSoundId,
  HabitCategory,
  TokenType,
  WalletSession,
} from '../types/actake';
import { deriveEscrowPoolPda, TOKEN_CONFIGS } from '../solana/actakeEscrow';
import { useActakePollar } from '../context/ActakePollarProvider';
import { formatClockTime12h } from '../utils/timeUtils';
import { ExploreHabitPreset } from './SquadsView';

interface MissionsViewProps {
  wallet: WalletSession;
  categories: HabitCategory[];
  defaultAlarmSound: AlarmSoundId;
  submitting: boolean;
  initialPreset?: ExploreHabitPreset | null;
  onClearPreset?: () => void;
  onAddCustomCategory: (cat: HabitCategory) => void;
  onOpenPollarFund: () => void;
  onSignInPollar: () => void;
  onCreateStake: (params: {
    category: HabitCategory;
    amount: number;
    token: TokenType;
    alarmHour: number;
    alarmMinute: number;
    motivationNote?: string;
    frequencyLabel?: string;
  }) => Promise<void>;
  onNavigateTab: (tab: 'home' | 'hunts' | 'squads') => void;
}

const STAKE_AMOUNTS = [5, 10, 15, 25, 50];
const FREQUENCIES = ['Daily', 'Weekdays', '5x / Week', 'Weekends'];

function CategoryIcon({ iconKey }: { iconKey: HabitCategory['iconKey'] }) {
  const cls = 'w-5 h-5';
  switch (iconKey) {
    case 'toothbrush':
      return <Sparkles className={`${cls} text-[#F16A2E]`} />;
    case 'dumbbell':
      return <Dumbbell className={`${cls} text-[#111114]`} />;
    case 'bed':
      return <BedDouble className={`${cls} text-[#6366F1]`} />;
    case 'book':
      return <BookOpen className={`${cls} text-[#0F766E]`} />;
    case 'grass':
      return <Leaf className={`${cls} text-[#16A34A]`} />;
    case 'kitchen':
      return <Coffee className={`${cls} text-[#EA580C]`} />;
    default:
      return <ShieldCheck className={`${cls} text-[#F16A2E]`} />;
  }
}

export const MissionsView: React.FC<MissionsViewProps> = ({
  wallet,
  categories,
  submitting,
  initialPreset,
  onClearPreset,
  onAddCustomCategory,
  onOpenPollarFund,
  onSignInPollar,
  onCreateStake,
  onNavigateTab,
}) => {
  const pollar = useActakePollar();
  const isPollarPaying =
    wallet.connectionKind === 'pollar' && pollar.configured && pollar.isAuthenticated;
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    initialPreset?.categoryId || categories[0]?.id || 'morning_wakeup'
  );
  const [amount, setAmount] = useState<number>(initialPreset?.amount ?? 10);
  const [token, setToken] = useState<TokenType>(initialPreset?.token ?? 'USDC');
  const [alarmHour, setAlarmHour] = useState<number>(initialPreset?.alarmHour ?? 6);
  const [alarmMinute, setAlarmMinute] = useState<number>(initialPreset?.alarmMinute ?? 30);
  const [frequencyLabel, setFrequencyLabel] = useState<string>('Daily');
  const [motivationNote, setMotivationNote] = useState<string>(
    initialPreset?.motivationNote || ''
  );

  const [derivedPda, setDerivedPda] = useState<string>('');
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customHint, setCustomHint] = useState('');
  const [stakeError, setStakeError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPreset) {
      setSelectedCategoryId(initialPreset.categoryId);
      setAmount(initialPreset.amount);
      setToken(initialPreset.token);
      setAlarmHour(initialPreset.alarmHour);
      setAlarmMinute(initialPreset.alarmMinute);
      setMotivationNote(initialPreset.motivationNote);
      onClearPreset?.();
    }
  }, [initialPreset, onClearPreset]);

  const selectedCategory =
    categories.find((c) => c.id === selectedCategoryId) || categories[0];

  useEffect(() => {
    let active = true;
    deriveEscrowPoolPda(wallet.publicKey, selectedCategory.id).then((pda) => {
      if (active) setDerivedPda(pda);
    });
    return () => {
      active = false;
    };
  }, [wallet.publicKey, selectedCategory.id]);

  const setOneMinuteFromNow = () => {
    const next = new Date(Date.now() + 62_000);
    setAlarmHour(next.getHours());
    setAlarmMinute(next.getMinutes());
  };

  const clockDisplay = formatClockTime12h(alarmHour, alarmMinute);
  const tokenCfg = TOKEN_CONFIGS[token];

  const handleLockStake = async () => {
    setStakeError(null);
    try {
      await onCreateStake({
        category: selectedCategory,
        amount,
        token,
        alarmHour,
        alarmMinute,
        motivationNote: motivationNote.trim() || undefined,
        frequencyLabel,
      });
    } catch (err) {
      setStakeError(err instanceof Error ? err.message : 'Failed to lock stake.');
    }
  };

  const handleSaveCustomCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = customName.trim();
    if (!trimmedName) return;
    const newCat: HabitCategory = {
      id: `custom_${Date.now()}`,
      name: trimmedName,
      subtitle: customHint.trim() || 'Custom physical verification proof',
      environmentHint:
        customHint.trim() || `Everyday physical objects or actions related to ${trimmedName}`,
      iconKey: 'custom',
      isCustom: true,
    };
    onAddCustomCategory(newCat);
    setSelectedCategoryId(newCat.id);
    setCustomName('');
    setCustomHint('');
    setCustomModalOpen(false);
  };

  const hourAngle = ((alarmHour % 12) + alarmMinute / 60) * 30;
  const minuteAngle = alarmMinute * 6;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onNavigateTab('home')}
            className="text-xs font-semibold text-[#6B6663] hover:text-[#111114] inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Today</span>
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
            Create Habit <span className="text-[#F16A2E]">&amp; Dedication Stake</span>
          </h1>
          <p className="text-sm text-[#6B6663]">
            Pick your habit, deadline, motivation note, and stake—the exact AI verification target
            stays randomized until your alarm rings.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-full bg-white shadow-[0_4px_14px_rgba(24,20,18,0.05)] self-start">
          <button
            type="button"
            className="px-4 py-1.5 rounded-full bg-[#111114] text-white text-xs font-bold whitespace-nowrap"
          >
            Solo Stake
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('hunts')}
            className="px-4 py-1.5 rounded-full text-[#6B6663] hover:text-[#111114] text-xs font-bold whitespace-nowrap"
          >
            GPS Hunt
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('squads')}
            className="px-4 py-1.5 rounded-full text-[#6B6663] hover:text-[#111114] text-xs font-bold whitespace-nowrap"
          >
            Community
          </button>
        </div>
      </div>

      {/* Main 2-Column Guided Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Step 1 Category + Step 3 Motivation Notes */}
        <div className="lg:col-span-7 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-extrabold text-[#111114]">
                1. Choose Habit Category
              </h2>
              <button
                type="button"
                onClick={() => setCustomModalOpen(true)}
                className="text-xs font-bold text-[#F16A2E] hover:text-[#D5551B] inline-flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Your Own</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {categories.map((cat) => {
                const active = cat.id === selectedCategory.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`text-left rounded-[24px] p-4 transition-all flex flex-col justify-between min-h-[124px] ${
                      active
                        ? 'bg-[#111114] text-white shadow-[0_12px_26px_rgba(17,17,20,0.18)]'
                        : 'bg-white text-[#111114] shadow-[0_6px_18px_rgba(24,20,18,0.05)] hover:bg-[#FFF9F5]'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                        active ? 'bg-white/15' : 'bg-[#FFF4EE]'
                      }`}
                    >
                      <CategoryIcon iconKey={cat.iconKey} />
                    </div>
                    <div className="mt-3">
                      <div className="font-display text-sm font-bold leading-snug">{cat.name}</div>
                      <div
                        className={`text-[11px] mt-0.5 line-clamp-2 ${
                          active ? 'text-white/70' : 'text-[#6B6663]'
                        }`}
                      >
                        {cat.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Frequency & Motivation Note */}
          <div className="actake-card p-5 space-y-4">
            <div>
              <label className="block font-display text-sm font-extrabold text-[#111114] mb-2">
                2. Frequency &amp; Motivation Note
              </label>
              <div className="flex flex-wrap gap-2">
                {FREQUENCIES.map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setFrequencyLabel(freq)}
                    className={`min-h-[36px] px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                      frequencyLabel === freq
                        ? 'bg-[#F16A2E] text-white'
                        : 'bg-[#FFF4EE] text-[#111114] hover:bg-[#FFE5D6]'
                    }`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6B6663] mb-1.5">
                Why does this habit matter to you? (Optional)
              </label>
              <input
                type="text"
                value={motivationNote}
                onChange={(e) => setMotivationNote(e.target.value)}
                placeholder="Type a short note to remind yourself when the alarm rings..."
                className="w-full rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-3 text-sm text-[#111114] placeholder:text-[#9A938E] focus:outline-none focus:border-[#F16A2E]"
              />
            </div>
          </div>
        </div>

        {/* Right: Step 3 Deadline Reminder Clock & Step 4 Dedication Stake */}
        <div className="lg:col-span-5 actake-card p-6 space-y-5">
          {/* Deadline Reminder Clock */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-extrabold text-[#111114] inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#F16A2E]" />
                3. Deadline Reminder
              </span>
              <button
                type="button"
                onClick={setOneMinuteFromNow}
                className="text-xs font-bold text-[#16A34A] hover:underline whitespace-nowrap"
              >
                +1 min (Live Test)
              </button>
            </div>

            <div className="flex items-center gap-4 rounded-2xl bg-[#FFF8F4] border border-[#F4E6DD] p-4">
              <svg viewBox="0 0 100 100" className="w-20 h-20 shrink-0">
                <circle cx="50" cy="50" r="46" fill="#FFFFFF" stroke="#F1D8C8" strokeWidth="3" />
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                  <line
                    key={deg}
                    x1="50"
                    y1="10"
                    x2="50"
                    y2="15"
                    stroke="#A09A96"
                    strokeWidth="2"
                    transform={`rotate(${deg} 50 50)`}
                  />
                ))}
                <line
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="26"
                  stroke="#111114"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  transform={`rotate(${hourAngle} 50 50)`}
                />
                <line
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="18"
                  stroke="#F16A2E"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  transform={`rotate(${minuteAngle} 50 50)`}
                />
                <circle cx="50" cy="50" r="3.5" fill="#111114" />
              </svg>

              <div className="flex-1 space-y-2">
                <div className="font-mono text-2xl font-extrabold text-[#111114] tabular-nums">
                  {clockDisplay.full}
                </div>
                <input
                  type="time"
                  aria-label="Alarm deadline time"
                  value={`${String(alarmHour).padStart(2, '0')}:${String(alarmMinute).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    if (!Number.isNaN(h) && !Number.isNaN(m)) {
                      setAlarmHour(h);
                      setAlarmMinute(m);
                    }
                  }}
                  className="w-full rounded-xl bg-white border border-[#ECDAD0] px-3 py-1.5 text-xs font-mono text-[#111114] focus:outline-none focus:border-[#F16A2E]"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '06:00', h: 6, m: 0 },
                { label: '06:30', h: 6, m: 30 },
                { label: '07:00', h: 7, m: 0 },
                { label: '08:00', h: 8, m: 0 },
              ].map((p) => {
                const isActive = alarmHour === p.h && alarmMinute === p.m;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setAlarmHour(p.h);
                      setAlarmMinute(p.m);
                    }}
                    className={`py-2 rounded-full text-xs font-mono font-bold transition-colors ${
                      isActive
                        ? 'bg-[#111114] text-white'
                        : 'bg-[#FFF4EE] text-[#6B6663] hover:text-[#111114]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-[#F4ECE7]" />

          {/* Step 4: Dedication Stake */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-display text-sm font-extrabold text-[#111114]">
                  4. Dedication Stake
                </div>
                <div className="text-xs text-[#6B6663]">
                  {token === 'SKR'
                    ? 'Token-2022 · 0% Fee · 2x $ACT yield'
                    : 'SPL Token · Dollar-pegged USDC escrow'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={token === 'SKR'}
                onClick={() => setToken((t) => (t === 'USDC' ? 'SKR' : 'USDC'))}
                className="flex items-center gap-2 text-xs font-bold text-[#111114] whitespace-nowrap"
              >
                <span>Use $SKR</span>
                <span
                  className={`w-10 h-6 rounded-full p-0.5 transition-colors flex items-center ${
                    token === 'SKR' ? 'bg-[#16A34A] justify-end' : 'bg-[#DDD3CC] justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                </span>
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {STAKE_AMOUNTS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(val)}
                  className={`min-h-[42px] rounded-full text-xs font-mono font-bold transition-colors ${
                    amount === val
                      ? 'bg-[#F16A2E] text-white'
                      : 'bg-[#FFF4EE] text-[#111114] hover:bg-[#FFE5D6]'
                  }`}
                >
                  ${val}
                </button>
              ))}
            </div>
          </div>

          {/* Escrow & Pollar Payment Breakdown */}
          <div className="rounded-2xl bg-[#FFF8F4] border border-[#F4E6DD] p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center gap-2">
              <span className="text-[#6B6663]">Payment Rail</span>
              {isPollarPaying ? (
                <span className="font-bold text-[#F16A2E] inline-flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Pollar Solana Pay</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onSignInPollar}
                  className="font-bold text-[#F16A2E] hover:underline"
                >
                  Switch to Pollar Pay
                </button>
              )}
            </div>
            {isPollarPaying && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-[#6B6663]">Pollar USDC Balance</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#111114] tabular-nums">
                    {pollar.solanaBalances.usdc !== null
                      ? `$${pollar.solanaBalances.usdc.toFixed(2)}`
                      : 'Syncing...'}
                  </span>
                  <button
                    type="button"
                    onClick={onOpenPollarFund}
                    className="font-bold text-[#16A34A] hover:underline"
                  >
                    + Fund
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#6B6663]">Instruction</span>
              <span className="font-mono font-semibold text-[#111114]">
                {isPollarPaying ? 'pollar::sendPayment(SOLANA)' : 'actake_escrow::join_pool'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B6663]">Protocol Fee</span>
              <span
                className={`font-bold tabular-nums ${
                  tokenCfg.protocolFeePct === 0 ? 'text-[#16A34A]' : 'text-[#111114]'
                }`}
              >
                {tokenCfg.protocolFeePct === 0 ? '0% (SKR Perk)' : `${tokenCfg.protocolFeePct}%`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B6663]">Escrow PDA</span>
              <span className="font-mono text-[#111114]">
                {derivedPda ? `${derivedPda.slice(0, 8)}...${derivedPda.slice(-6)}` : 'Deriving...'}
              </span>
            </div>
          </div>

          {stakeError && (
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#991B1B] space-y-2">
              <div>{stakeError}</div>
              {isPollarPaying && (
                <button
                  type="button"
                  onClick={onOpenPollarFund}
                  className="px-3 py-1.5 rounded-full bg-[#F16A2E] text-white text-[11px] font-bold hover:bg-[#DC5A20] transition-colors"
                >
                  Fund Wallet with Pollar
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={handleLockStake}
            className="w-full min-h-[52px] px-5 py-3 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-sm"
          >
            <Wallet className="w-4 h-4" />
            <span>
              {submitting
                ? isPollarPaying
                  ? 'Submitting Payment via Pollar...'
                  : 'Signing join_pool on Devnet...'
                : isPollarPaying
                  ? `Pay & Lock $${amount.toFixed(2)} ${token} via Pollar`
                  : `Save & Lock $${amount.toFixed(2)} ${token}`}
            </span>
          </button>
        </div>
      </div>

      {/* Create Custom Category Modal */}
      {customModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#111114]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-[#111114]">
                Create Custom Habit Category
              </h3>
              <button
                type="button"
                onClick={() => setCustomModalOpen(false)}
                className="w-9 h-9 rounded-full bg-[#FFF4EE] flex items-center justify-center text-[#111114]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCustomCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111114] mb-1">
                  Habit Name
                </label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g., Piano Practice or Cold Plunge"
                  className="w-full rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-2.5 text-sm focus:outline-none focus:border-[#F16A2E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111114] mb-1">
                  Environment Hint (for AI Item &amp; Action Randomizer)
                </label>
                <textarea
                  rows={3}
                  value={customHint}
                  onChange={(e) => setCustomHint(e.target.value)}
                  placeholder="Describe items or exercises nearby so Gemini picks varied, fair live proofs..."
                  className="w-full rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-2.5 text-sm focus:outline-none focus:border-[#F16A2E]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCustomModalOpen(false)}
                  className="px-4 py-2 rounded-full text-sm font-medium text-[#6B6663] hover:bg-[#FFF4EE]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-[#F16A2E] text-white text-sm font-bold hover:bg-[#DC5A20]"
                >
                  Save Habit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
