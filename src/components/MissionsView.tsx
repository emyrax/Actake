import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BedDouble,
  BookOpen,
  Check,
  Clock,
  Coffee,
  Copy,
  Dumbbell,
  ExternalLink,
  Flame,
  Footprints,
  Globe,
  Leaf,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  AlarmSoundId,
  HabitCategory,
  TokenType,
  TreasuryConfigSummary,
  WalletSession,
} from '../types/actake';
import {
  buildDevnetExplorerAddressUrl,
  deriveEscrowPoolPda,
  resolveStakeDepositDestination,
  TOKEN_CONFIGS,
} from '../solana/actakeEscrow';
import { useActakePollar } from '../context/ActakePollarProvider';
import { formatClockTime12h, formatTimeUntilNextDeadline } from '../utils/timeUtils';
import {
  calculateDailyPayoutBreakdown,
  clampRecurringDays,
  formatScheduleLabel,
  RECURRING_DAY_PRESETS,
  RecurrenceCadence,
  StakeVisibility,
} from '../utils/stakePayouts';
import { ExploreHabitPreset } from './SquadsView';
import { MascotDisplay } from './MascotDisplay';
import { ErrorStateCard } from './UiPrimitives';
import { AccountabilityPoolsWorkspace } from '../features/accountability-pools';

interface MissionsViewProps {
  wallet: WalletSession;
  categories: HabitCategory[];
  defaultAlarmSound: AlarmSoundId;
  submitting: boolean;
  initialPreset?: ExploreHabitPreset | null;
  initialVisibility?: StakeVisibility | null;
  initialCreateMode?: 'solo' | 'track-pools' | null;
  initialTrackPoolId?: string | null;
  treasuryConfig?: TreasuryConfigSummary | null;
  onClearPreset?: () => void;
  onClearInitialVisibility?: () => void;
  onClearTrackPoolNavigation?: () => void;
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
    visibility?: StakeVisibility;
    poolName?: string;
    totalDays?: number;
    recurrencePattern?: RecurrenceCadence;
  }) => Promise<void>;
  onNavigateTab: (tab: 'home' | 'hunts' | 'squads') => void;
}

const STAKE_AMOUNTS = [5, 10, 15, 25, 50];

interface QuickStakePreset {
  id: string;
  title: string;
  badge: string;
  description: string;
  categoryId: string;
  amount: number;
  token: TokenType;
  alarmHour: number;
  alarmMinute: number;
  totalDays: number;
  cadence: RecurrenceCadence;
  motivationNote: string;
  icon: 'run' | 'work' | 'read';
}

const QUICK_STAKE_PRESETS: QuickStakePreset[] = [
  {
    id: 'quick-morning-run',
    title: 'Morning Run',
    badge: 'Trending · 1.2k staked',
    description: 'Step outside and snap running shoes or daylight before breakfast.',
    categoryId: 'outdoors_grass',
    amount: 15,
    token: 'USDC',
    alarmHour: 6,
    alarmMinute: 30,
    totalDays: 7,
    cadence: 'daily',
    motivationNote: 'Morning Run — 20 minutes outside before checking messages.',
    icon: 'run',
  },
  {
    id: 'quick-deep-work',
    title: 'Deep Work',
    badge: '0% SKR Fee · 890 staked',
    description: 'Verify your focused desk setup and lock into a 90-minute sprint.',
    categoryId: 'reading_study',
    amount: 25,
    token: 'SKR',
    alarmHour: 9,
    alarmMinute: 0,
    totalDays: 7,
    cadence: 'weekdays',
    motivationNote: 'Deep Work — 90-minute phone-free builder sprint at my desk.',
    icon: 'work',
  },
  {
    id: 'quick-read-20m',
    title: 'Read 20m',
    badge: 'Night Routine · 640 staked',
    description: 'Open a physical book and finish 20 minutes before lights out.',
    categoryId: 'reading_study',
    amount: 10,
    token: 'USDC',
    alarmHour: 21,
    alarmMinute: 0,
    totalDays: 3,
    cadence: 'daily',
    motivationNote: 'Read 20m — 20 pages of a real book instead of scrolling.',
    icon: 'read',
  },
];

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
  initialVisibility,
  initialCreateMode,
  initialTrackPoolId,
  treasuryConfig,
  onClearPreset,
  onClearInitialVisibility,
  onClearTrackPoolNavigation,
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
  const [amountInput, setAmountInput] = useState<string>(String(initialPreset?.amount ?? 10));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [token, setToken] = useState<TokenType>(initialPreset?.token ?? 'USDC');
  const [alarmHour, setAlarmHour] = useState<number>(initialPreset?.alarmHour ?? 6);
  const [alarmMinute, setAlarmMinute] = useState<number>(initialPreset?.alarmMinute ?? 30);
  const [visibility, setVisibility] = useState<StakeVisibility>(
    initialVisibility ?? initialPreset?.visibility ?? 'solo'
  );
  const [communityPoolName, setCommunityPoolName] = useState<string>('');
  const [totalDays, setTotalDays] = useState<number>(initialPreset?.totalDays ?? 7);
  const [daysInput, setDaysInput] = useState<string>(String(initialPreset?.totalDays ?? 7));
  const [daysError, setDaysError] = useState<string | null>(null);
  const [cadence, setCadence] = useState<RecurrenceCadence>(
    (initialPreset?.totalDays ?? 7) <= 1 ? 'once' : 'daily'
  );
  const [motivationNote, setMotivationNote] = useState<string>(
    initialPreset?.motivationNote || ''
  );

  const [derivedPda, setDerivedPda] = useState<string>('');
  const [copiedEscrow, setCopiedEscrow] = useState(false);
  const [activeQuickPresetId, setActiveQuickPresetId] = useState<string | null>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customHint, setCustomHint] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [createMode, setCreateMode] = useState<'solo' | 'track-pools'>('solo');

  const applyQuickPreset = (preset: QuickStakePreset) => {
    const matchedCat =
      categories.find((c) => c.id === preset.categoryId) || categories[0];
    setSelectedCategoryId(matchedCat.id);
    setAmount(preset.amount);
    setAmountInput(String(preset.amount));
    setAmountError(null);
    setToken(preset.token);
    setAlarmHour(preset.alarmHour);
    setAlarmMinute(preset.alarmMinute);
    setTotalDays(preset.totalDays);
    setDaysInput(String(preset.totalDays));
    setDaysError(null);
    setCadence(preset.cadence);
    setMotivationNote(preset.motivationNote);
    setActiveQuickPresetId(preset.id);
    setStakeError(null);
  };

  useEffect(() => {
    if (initialPreset) {
      setCreateMode('solo');
      setSelectedCategoryId(initialPreset.categoryId);
      setAmount(initialPreset.amount);
      setAmountInput(String(initialPreset.amount));
      setAmountError(null);
      setToken(initialPreset.token);
      setAlarmHour(initialPreset.alarmHour);
      setAlarmMinute(initialPreset.alarmMinute);
      const nextDays = clampRecurringDays(initialPreset.totalDays ?? 7);
      setTotalDays(nextDays);
      setDaysInput(String(nextDays));
      setDaysError(null);
      setCadence(nextDays <= 1 ? 'once' : 'daily');
      if (initialPreset.visibility) {
        setVisibility(initialPreset.visibility);
      }
      setMotivationNote(initialPreset.motivationNote);
      setActiveQuickPresetId(null);
      onClearPreset?.();
    }
  }, [initialPreset, onClearPreset]);

  useEffect(() => {
    if (initialVisibility) {
      setCreateMode('solo');
      setVisibility(initialVisibility);
      onClearInitialVisibility?.();
    }
  }, [initialVisibility, onClearInitialVisibility]);

  useEffect(() => {
    if (initialCreateMode === 'track-pools' || initialTrackPoolId) {
      setCreateMode('track-pools');
    } else if (initialCreateMode === 'solo') {
      setCreateMode('solo');
    }
  }, [initialCreateMode, initialTrackPoolId]);

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

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const clockDisplay = formatClockTime12h(alarmHour, alarmMinute);
  const nextDeadlineOffset = formatTimeUntilNextDeadline(alarmHour, alarmMinute, nowMs);
  const tokenCfg = TOKEN_CONFIGS[token];
  const scheduleLabel = formatScheduleLabel(totalDays, cadence);
  const payoutBreakdown = calculateDailyPayoutBreakdown({
    totalStake: Number.isFinite(amount) ? amount : 0,
    totalDays,
    token,
    visibility,
  });

  const handleAmountChange = (val: number, raw?: string) => {
    if (raw !== undefined) {
      setAmountInput(raw);
    } else {
      setAmountInput(String(val));
    }
    setAmount(val);
    if (!Number.isFinite(val) || val < 1) {
      setAmountError('Minimum stake amount is $1.');
    } else if (val > 1_000_000) {
      setAmountError('Enter a realistic stake up to $1,000,000.');
    } else {
      setAmountError(null);
    }
  };

  const handleSelectDays = (nextDays: number, nextCadence?: RecurrenceCadence) => {
    const safe = clampRecurringDays(nextDays);
    setTotalDays(safe);
    setDaysInput(String(safe));
    setDaysError(null);
    if (safe === 1) {
      setCadence('once');
    } else if (nextCadence) {
      setCadence(nextCadence);
    } else if (cadence === 'once') {
      setCadence('daily');
    }
  };

  const handleCustomDaysInput = (raw: string) => {
    setDaysInput(raw);
    if (raw.trim() === '') {
      setDaysError('Enter at least 1 day.');
      return;
    }
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
      setDaysError('Recurring duration must be between 1 and 365 days.');
      return;
    }
    setDaysError(null);
    setTotalDays(parsed);
    setCadence((prev) => (parsed === 1 ? 'once' : prev === 'once' ? 'daily' : prev));
  };

  const handleLockStake = async () => {
    setStakeError(null);
    if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) {
      setAmountError('Enter a valid stake of $1 or more.');
      return;
    }
    if (!Number.isFinite(totalDays) || totalDays < 1 || totalDays > 365 || daysError) {
      setDaysError('Enter a recurring duration between 1 and 365 days.');
      return;
    }
    try {
      await onCreateStake({
        category: selectedCategory,
        amount: Number(amount.toFixed(2)),
        token,
        alarmHour,
        alarmMinute,
        motivationNote: motivationNote.trim() || undefined,
        frequencyLabel: scheduleLabel,
        visibility,
        poolName:
          visibility === 'community' && communityPoolName.trim()
            ? communityPoolName.trim()
            : undefined,
        totalDays,
        recurrencePattern: totalDays === 1 ? 'once' : cadence,
      });
    } catch (err) {
      setStakeError(err instanceof Error ? err.message : 'Failed to lock stake.');
    }
  };

  const handleSaveCustomCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = customName.trim();
    if (trimmedName.length < 2) {
      setCustomError('Enter a habit name with at least 2 characters.');
      return;
    }
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
    setCustomError(null);
    setCustomModalOpen(false);
  };

  const hourAngle = ((alarmHour % 12) + alarmMinute / 60) * 30;
  const minuteAngle = alarmMinute * 6;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <MascotDisplay
            variant="medallion"
            size="md"
            floating
            alt="Actake Stake Creator Mascot"
          />
          <div className="space-y-1 min-w-0">
            <button
              type="button"
              onClick={() => onNavigateTab('home')}
              className="min-h-[36px] text-xs font-semibold text-[#6B6663] hover:text-[#111114] inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Today</span>
            </button>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
              {createMode === 'track-pools' ? (
                <>
                  Accountability <span className="text-[#F16A2E]">Track Pools</span>
                </>
              ) : visibility === 'community' ? (
                <>
                  Create Public <span className="text-[#F16A2E]">Community Pool</span>
                </>
              ) : (
                <>
                  Create Habit <span className="text-[#F16A2E]">&amp; Dedication Stake</span>
                </>
              )}
            </h1>
            <p className="text-sm text-[#6B6663]">
              {createMode === 'track-pools'
                ? 'Stake USDC or SKR on multi-day Steps, Gym, or Study pools with daily on-chain SHA-256 proofs and Solscan-verifiable settlements.'
                : visibility === 'community'
                  ? 'Open your habit to the public—anyone on Explore can see the exact stake amount, recurring cycle, and join in one tap.'
                  : 'Pick your habit, recurring days, deadline, and stake—keep it solo or open it to the public anytime before locking.'}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center p-1 rounded-full bg-white border border-[#EFE2D9] shadow-[0_4px_14px_rgba(24,20,18,0.04)] self-start max-w-full">
          <button
            type="button"
            onClick={() => setCreateMode('solo')}
            className={`min-h-[40px] px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              createMode === 'solo'
                ? 'bg-[#111114] text-white'
                : 'text-[#6B6663] hover:text-[#111114]'
            }`}
          >
            Habit Stake
          </button>
          <button
            type="button"
            onClick={() => setCreateMode('track-pools')}
            className={`min-h-[40px] px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              createMode === 'track-pools'
                ? 'bg-[#111114] text-white'
                : 'text-[#6B6663] hover:text-[#111114]'
            }`}
          >
            Track Pools
          </button>
        </div>
      </div>

      {createMode === 'track-pools' ? (
        <AccountabilityPoolsWorkspace
          wallet={wallet}
          escrowWallet={treasuryConfig?.escrowWallet || null}
          treasuryWallet={treasuryConfig?.treasuryWallet || null}
          initialPoolId={initialTrackPoolId || null}
          onClearInitialSelection={onClearTrackPoolNavigation}
        />
      ) : (
      <>
      {/* Quick Stake Trending Presets Carousel */}
      <section className="space-y-3" aria-label="Quick Stake trending presets">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-extrabold text-[#111114] leading-tight">
                Quick Stake
              </h2>
              <p className="text-xs text-[#6B6663]">
                Tap a trending preset to prefill your stake, token, and daily alarm
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-[#F16A2E] inline-flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" />
            <span>3 trending presets</span>
          </span>
        </div>

        <div className="actake-no-scrollbar flex md:grid md:grid-cols-3 gap-3.5 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-1">
          {QUICK_STAKE_PRESETS.map((preset) => {
            const isApplied = activeQuickPresetId === preset.id;
            const presetClock = formatClockTime12h(preset.alarmHour, preset.alarmMinute);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyQuickPreset(preset)}
                className={`snap-start shrink-0 w-[272px] sm:w-[292px] md:w-auto text-left rounded-[24px] p-4 sm:p-5 border transition-all flex flex-col justify-between gap-3.5 ${
                  isApplied
                    ? 'bg-[#141416] border-[#141416] text-white shadow-[0_12px_28px_rgba(17,17,20,0.18)]'
                    : 'bg-white border-[#EFE2D9] text-[#111114] hover:border-[#F16A2E]/65 hover:bg-[#FFF9F5] shadow-[0_8px_22px_rgba(24,20,18,0.04)]'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        isApplied
                          ? 'bg-[#F16A2E] text-white'
                          : 'bg-[#FFF2EA] text-[#F16A2E]'
                      }`}
                    >
                      {preset.icon === 'run' ? (
                        <Footprints className="w-5 h-5" />
                      ) : preset.icon === 'work' ? (
                        <Zap className="w-5 h-5" />
                      ) : (
                        <BookOpen className="w-5 h-5" />
                      )}
                    </span>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${
                        isApplied
                          ? 'bg-[#16A34A]/25 text-[#4ADE80]'
                          : 'bg-[#FFF4EE] text-[#F16A2E]'
                      }`}
                    >
                      {isApplied ? 'Preset Applied' : preset.badge}
                    </span>
                  </div>

                  <div>
                    <div className="font-display text-base font-extrabold leading-snug">
                      {preset.title}
                    </div>
                    <p
                      className={`text-xs mt-1 leading-relaxed line-clamp-2 ${
                        isApplied ? 'text-white/75' : 'text-[#6B6663]'
                      }`}
                    >
                      {preset.description}
                    </p>
                  </div>
                </div>

                <div
                  className={`pt-3 border-t flex items-center justify-between gap-2 text-xs tabular-nums ${
                    isApplied ? 'border-white/15' : 'border-[#F4ECE7]'
                  }`}
                >
                  <div className="font-mono font-bold">
                    ${preset.amount} {preset.token}
                    <span
                      className={`font-sans font-medium ${
                        isApplied ? 'text-white/65' : 'text-[#877F7A]'
                      }`}
                    >
                      {' '}
                      · {presetClock.full}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 font-bold text-[11px] ${
                      isApplied ? 'text-[#4ADE80]' : 'text-[#F16A2E]'
                    }`}
                  >
                    {isApplied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Loaded</span>
                      </>
                    ) : (
                      <span>Use Preset</span>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main 2-Column Guided Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Visibility + Step 1 Category + Step 2 Dynamic Recurring Schedule & Motivation */}
        <div className="lg:col-span-7 space-y-5">
          {/* Unified Audience / Visibility Switcher (Solo default -> Public Community opt-in) */}
          <div className="actake-card p-5 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-sm font-extrabold text-[#111114]">
                  Who Can Join This Stake?
                </div>
                <p className="text-xs text-[#6B6663] mt-0.5">
                  {visibility === 'community'
                    ? 'Listed publicly on Explore — joiners see your exact buy-in, cycle length, and daily unlock.'
                    : 'Private solo commitment by default. Switch to Public Community to let anyone join.'}
                </p>
              </div>
              <div
                role="radiogroup"
                aria-label="Stake visibility"
                className="inline-flex items-center p-1 rounded-full bg-[#FFF4EE] border border-[#F2E3DA] self-start sm:self-auto shrink-0"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={visibility === 'solo'}
                  onClick={() => setVisibility('solo')}
                  className={`min-h-[42px] px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
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
                  className={`min-h-[42px] px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
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
              <div className="pt-3 border-t border-[#F4ECE7] space-y-2.5">
                <div>
                  <label
                    htmlFor="community-pool-name-input"
                    className="block text-xs font-semibold text-[#111114] mb-1.5"
                  >
                    Community Pool Name <span className="font-normal text-[#877F7A]">(Optional — defaults to {selectedCategory.name})</span>
                  </label>
                  <input
                    id="community-pool-name-input"
                    type="text"
                    maxLength={80}
                    value={communityPoolName}
                    onChange={(e) => setCommunityPoolName(e.target.value)}
                    placeholder={`e.g., ${selectedCategory.name} Accountability Club`}
                    className="w-full min-h-[46px] rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-2.5 text-sm text-[#111114] placeholder:text-[#9A938E] focus:outline-none focus:border-[#F16A2E]"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6B6663] tabular-nums">
                  <Users className="w-3.5 h-3.5 text-[#F16A2E] shrink-0" />
                  <span>Public joiner preview:</span>
                  <span className="font-mono font-bold text-[#111114]">
                    ${Number.isFinite(amount) && amount >= 1 ? amount.toFixed(2) : '0.00'} {token} buy-in
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{scheduleLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-[#16A34A]">
                    ${payoutBreakdown.baseDailyPrincipal.toFixed(2)}/day unlock
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-extrabold text-[#111114]">
                1. Choose Habit Category
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCustomError(null);
                  setCustomModalOpen(true);
                }}
                className="min-h-[40px] px-3 rounded-full text-xs font-bold text-[#F16A2E] hover:bg-[#FFF0E6] inline-flex items-center gap-1 whitespace-nowrap transition-colors"
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
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      setActiveQuickPresetId(null);
                    }}
                    className={`text-left rounded-[24px] p-4 transition-all flex flex-col justify-between min-h-[124px] border ${
                      active
                        ? 'bg-[#111114] border-[#111114] text-white shadow-[0_12px_26px_rgba(17,17,20,0.18)]'
                        : 'bg-white border-[#EFE2D9] text-[#111114] hover:border-[#DFC4B4] hover:bg-[#FFF9F5]'
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

          {/* Step 2: Dynamic Recurring Duration & Motivation Note */}
          <div className="actake-card p-5 space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-display text-sm font-extrabold text-[#111114]">
                  2. Recurring Duration &amp; Daily Split
                </div>
                <span className="text-xs font-mono font-semibold text-[#F16A2E] tabular-nums">
                  {scheduleLabel}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {RECURRING_DAY_PRESETS.map((preset) => {
                  const isActive = totalDays === preset.days;
                  return (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => handleSelectDays(preset.days, preset.cadence)}
                      className={`min-h-[48px] px-2.5 py-2 rounded-2xl text-center transition-colors border ${
                        isActive
                          ? 'bg-[#111114] border-[#111114] text-white'
                          : 'bg-[#FFF8F4] border-[#F2E3DA] text-[#111114] hover:border-[#F16A2E]/60'
                      }`}
                    >
                      <div className="text-xs font-bold leading-tight whitespace-nowrap">
                        {preset.shortLabel}
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 whitespace-nowrap ${
                          isActive ? 'text-white/70' : 'text-[#877F7A]'
                        }`}
                      >
                        {preset.subLabel}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Custom Days Stepper + Optional Cadence */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="custom-recurring-days"
                    className="text-xs font-semibold text-[#6B6663] whitespace-nowrap"
                  >
                    Custom Days
                  </label>
                  <div className="inline-flex items-center rounded-xl bg-[#FFF8F4] border border-[#F2E3DA] p-0.5">
                    <button
                      type="button"
                      aria-label="Decrease recurring days"
                      onClick={() => handleSelectDays(Math.max(1, totalDays - 1))}
                      className="w-10 h-10 rounded-lg hover:bg-[#FFE5D6] text-[#111114] flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      id="custom-recurring-days"
                      type="number"
                      min={1}
                      max={365}
                      step={1}
                      value={daysInput}
                      onChange={(e) => handleCustomDaysInput(e.target.value)}
                      className="w-14 h-10 bg-transparent text-center font-mono text-sm font-bold text-[#111114] tabular-nums focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Increase recurring days"
                      onClick={() => handleSelectDays(Math.min(365, totalDays + 1))}
                      className="w-10 h-10 rounded-lg hover:bg-[#FFE5D6] text-[#111114] flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-xs text-[#877F7A]">
                    {totalDays === 1 ? 'time' : 'days'}
                  </span>
                </div>

                {totalDays > 1 && (
                  <div className="inline-flex items-center p-1 rounded-full bg-[#FFF4EE] border border-[#F2E3DA] self-start sm:self-auto">
                    {(
                      [
                        { id: 'daily', label: 'Every Day' },
                        { id: 'weekdays', label: 'Weekdays' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCadence(opt.id)}
                        className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                          cadence === opt.id
                            ? 'bg-[#F16A2E] text-white'
                            : 'text-[#6B6663] hover:text-[#111114]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {daysError && (
                <div className="text-xs text-[#DC2626] font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{daysError}</span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#F4ECE7]">
              <label
                htmlFor="motivation-note-input"
                className="block text-xs font-semibold text-[#6B6663] mb-1.5"
              >
                Why does this habit matter to you? (Optional)
              </label>
              <input
                id="motivation-note-input"
                type="text"
                value={motivationNote}
                onChange={(e) => setMotivationNote(e.target.value)}
                placeholder="Type a short note to remind yourself when the alarm rings..."
                className="w-full min-h-[46px] rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-3 text-sm text-[#111114] placeholder:text-[#9A938E] focus:outline-none focus:border-[#F16A2E]"
              />
            </div>
          </div>
        </div>

        {/* Right: Step 3 Deadline Reminder Clock & Step 4 Dedication Stake */}
        <div className="lg:col-span-5 actake-card p-6 space-y-5">
          {/* Deadline Reminder Clock */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-extrabold text-[#111114] inline-flex items-center gap-1.5 min-w-0">
                <Clock className="w-4 h-4 text-[#F16A2E] shrink-0" />
                <span className="truncate">3. Deadline Reminder</span>
              </span>
              <span
                title={`Next deadline in ${nextDeadlineOffset.replace(/^\+/, '')}`}
                className="px-2.5 py-1 rounded-full bg-[#ECFDF5] border border-[#BBF7D0] text-xs font-mono font-bold text-[#15803D] whitespace-nowrap tabular-nums shrink-0"
              >
                {nextDeadlineOffset}
              </span>
            </div>

            <div className="flex items-center gap-4 rounded-2xl bg-[#FFF8F4] border border-[#F4E6DD] p-4">
              <svg viewBox="0 0 100 100" className="w-20 h-20 shrink-0" aria-hidden="true">
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

              <div className="flex-1 space-y-2 min-w-0">
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
                  className="w-full min-h-[40px] rounded-xl bg-white border border-[#ECDAD0] px-3 py-1.5 text-xs font-mono text-[#111114] focus:outline-none focus:border-[#F16A2E]"
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
                    className={`min-h-[40px] py-2 rounded-full text-xs font-mono font-bold transition-colors ${
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
                className="min-h-[40px] flex items-center gap-2 text-xs font-bold text-[#111114] whitespace-nowrap"
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
                  onClick={() => handleAmountChange(val)}
                  className={`min-h-[44px] rounded-full text-xs font-mono font-bold transition-colors ${
                    amount === val
                      ? 'bg-[#F16A2E] text-white'
                      : 'bg-[#FFF4EE] text-[#111114] hover:bg-[#FFE5D6]'
                  }`}
                >
                  ${val}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="custom-stake-amount" className="text-xs font-semibold text-[#6B6663] whitespace-nowrap">
                Custom ($1+)
              </label>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-[#877F7A]">
                  $
                </span>
                <input
                  id="custom-stake-amount"
                  type="number"
                  min={1}
                  step="any"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => handleAmountChange(Number(e.target.value), e.target.value)}
                  placeholder="Enter any amount ($1+)"
                  className="w-full min-h-[44px] rounded-xl bg-[#FFF8F4] border border-[#F2E3DA] pl-7 pr-3 py-1.5 font-mono text-sm font-bold text-[#111114] tabular-nums focus:outline-none focus:border-[#F16A2E]"
                />
              </div>
            </div>

            {amountError && (
              <div className="text-xs text-[#DC2626] font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{amountError}</span>
              </div>
            )}

            {/* Dynamic Daily Payout Breakdown (Split Evenly Across N Days) */}
            <div className="rounded-2xl bg-[#111114] text-white p-4 space-y-2.5 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white/70">
                  {totalDays === 1 ? 'One-Time Payout Preview' : `Per-Day Payout (${totalDays} Days)`}
                </span>
                <span className="font-mono font-bold text-[#4ADE80]">
                  {visibility === 'community' ? 'Public Pool' : 'Solo Stake'}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2 pt-0.5">
                <span className="text-white/75">
                  {totalDays === 1 ? 'Est. Payout on Completion' : 'Est. Payout Per Completed Day'}
                </span>
                <span className="font-mono text-lg font-extrabold text-white">
                  ${payoutBreakdown.estNetDailyPayout.toFixed(2)} {token}
                </span>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-1.5 text-[11px] text-white/70">
                <div className="flex justify-between gap-2">
                  <span>Principal unlocked / day</span>
                  <span className="font-mono font-semibold text-white">
                    ${payoutBreakdown.baseDailyPrincipal.toFixed(2)}
                    {payoutBreakdown.hasFinalDayRemainder
                      ? ` (Day ${totalDays}: $${payoutBreakdown.finalDayPrincipal.toFixed(2)})`
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Est. slashed bonus / day</span>
                  <span className="font-mono font-semibold text-[#4ADE80]">
                    +${payoutBreakdown.estDailyBonus.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Full {totalDays === 1 ? 'completion' : `${totalDays}-day`} est. total</span>
                  <span className="font-mono font-semibold text-white">
                    ${payoutBreakdown.estFullCyclePayout.toFixed(2)} {token}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Escrow & Pollar Payment Breakdown */}
          <div className="rounded-2xl bg-[#FFF8F4] border border-[#F4E6DD] p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center gap-2">
              <span className="text-[#6B6663]">Visibility</span>
              <span className="font-bold text-[#111114]">
                {visibility === 'community' ? 'Public · Open on Explore' : 'Solo · Private'}
              </span>
            </div>
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
            <div className="flex justify-between gap-2">
              <span className="text-[#6B6663]">Instruction</span>
              <span className="font-mono font-semibold text-[#111114] truncate">
                {isPollarPaying ? 'pollar::sendPayment(SOLANA)' : 'actake_escrow::join_pool'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#6B6663]">Protocol Fee</span>
              <span
                className={`font-bold tabular-nums ${
                  tokenCfg.protocolFeePct === 0 ? 'text-[#16A34A]' : 'text-[#111114]'
                }`}
              >
                {tokenCfg.protocolFeePct === 0
                  ? '0% (SKR Perk)'
                  : `${tokenCfg.protocolFeePct}% → Fee Treasury`}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#6B6663]">
                {visibility === 'community' ? 'Missed Member Stake' : 'Missed Personal Stake'}
              </span>
              <span className="font-semibold text-[#111114] text-right">
                {visibility === 'community'
                  ? 'Slashed to verified pool members'
                  : `50% Owner / 50% → Actake Treasury${
                      treasuryConfig?.treasuryWallet
                        ? ` (${treasuryConfig.treasuryWallet.slice(0, 4)}...${treasuryConfig.treasuryWallet.slice(-4)})`
                        : ''
                    }`}
              </span>
            </div>
            {(() => {
              const target = resolveStakeDepositDestination({
                poolPda: derivedPda || '',
                runtimeEscrowWallet: treasuryConfig?.escrowWallet,
              });
              const displayAddr = target.destination || derivedPda;
              return (
                <>
                  <div className="flex justify-between items-center gap-2 pt-1 border-t border-[#EFE2D9]">
                    <span className="text-[#6B6663]">
                      {target.mode === 'escrow-wallet'
                        ? 'Escrow Vault Wallet'
                        : target.mode === 'anchor-pda'
                          ? 'Anchor Vault PDA'
                          : 'Derived Escrow PDA'}
                    </span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[#111114] truncate">
                        {displayAddr
                          ? `${displayAddr.slice(0, 6)}...${displayAddr.slice(-4)}`
                          : 'Deriving...'}
                      </span>
                      {displayAddr && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(displayAddr);
                                setCopiedEscrow(true);
                                window.setTimeout(() => setCopiedEscrow(false), 1600);
                              } catch {
                                // ignore clipboard restrictions
                              }
                            }}
                            aria-label="Copy escrow destination address"
                            className="p-1 rounded-md text-[#6B6663] hover:text-[#F16A2E]"
                          >
                            {copiedEscrow ? (
                              <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <a
                            href={buildDevnetExplorerAddressUrl(displayAddr)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="View escrow address on Solana Explorer"
                            className="p-1 rounded-md text-[#F16A2E] hover:text-[#111114]"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  {isPollarPaying && !target.safeForRealTokens && (
                    <div className="mt-2 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] px-3 py-2 text-[11px] text-[#92400E] leading-relaxed">
                      <strong>Escrow Wallet Required for Pollar:</strong> Add{' '}
                      <code className="font-mono">ACTAKE_ESCROW_WALLET</code> (public Solana
                      address) in Vercel env vars so real Pollar tokens route to your vault instead
                      of an unowned PDA.
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {stakeError && (
            <div className="space-y-2">
              <ErrorStateCard
                title="Stake transaction did not complete"
                message={stakeError}
                onRetry={() => void handleLockStake()}
                retryLabel="Retry Stake"
              />
              {isPollarPaying && (
                <button
                  type="button"
                  onClick={onOpenPollarFund}
                  className="w-full min-h-[42px] px-4 py-2 rounded-full bg-[#F16A2E] text-white text-xs font-bold hover:bg-[#DC5A20] transition-colors"
                >
                  Fund Wallet with Pollar
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={submitting || Boolean(amountError) || Boolean(daysError)}
            onClick={() => void handleLockStake()}
            className="w-full min-h-[52px] px-5 py-3 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-75 shadow-sm"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#F16A2E]" />
            ) : visibility === 'community' ? (
              <Globe className="w-4 h-4" />
            ) : (
              <Wallet className="w-4 h-4" />
            )}
            <span>
              {submitting
                ? isPollarPaying
                  ? 'Submitting Payment via Pollar...'
                  : visibility === 'community'
                    ? 'Publishing Public Pool on Devnet...'
                    : 'Signing join_pool on Devnet...'
                : visibility === 'community'
                  ? isPollarPaying
                    ? `Publish Public Pool & Pay $${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} ${token}`
                    : `Publish Public Pool & Lock $${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} ${token}`
                  : isPollarPaying
                    ? `Pay & Lock $${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} ${token} via Pollar`
                    : `Save & Lock $${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} ${token}`}
            </span>
          </button>

          {submitting && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-[#6B6663]"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F16A2E] shrink-0" />
              <span>
                {isPollarPaying
                  ? 'Confirm the payment prompt in Pollar — the page stays interactive while it processes.'
                  : 'Approve the transaction in your wallet — confirming in the background.'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Create Custom Category Modal */}
      {customModalOpen && (
        <div
          onClick={() => setCustomModalOpen(false)}
          className="fixed inset-0 z-50 bg-[#111114]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-white p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-[#111114]">
                Create Custom Habit Category
              </h3>
              <button
                type="button"
                aria-label="Close custom habit modal"
                onClick={() => setCustomModalOpen(false)}
                className="w-11 h-11 rounded-full bg-[#FFF4EE] hover:bg-[#FFE5D6] flex items-center justify-center text-[#111114] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCustomCategory} className="space-y-4">
              <div>
                <label htmlFor="custom-habit-name" className="block text-xs font-semibold text-[#111114] mb-1">
                  Habit Name
                </label>
                <input
                  id="custom-habit-name"
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => {
                    setCustomError(null);
                    setCustomName(e.target.value);
                  }}
                  placeholder="e.g., Piano Practice or Cold Plunge"
                  className="w-full min-h-[46px] rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-2.5 text-sm focus:outline-none focus:border-[#F16A2E]"
                />
              </div>
              <div>
                <label htmlFor="custom-habit-hint" className="block text-xs font-semibold text-[#111114] mb-1">
                  Environment Hint (for AI Item &amp; Action Randomizer)
                </label>
                <textarea
                  id="custom-habit-hint"
                  rows={3}
                  value={customHint}
                  onChange={(e) => setCustomHint(e.target.value)}
                  placeholder="Describe items or exercises nearby so Gemini picks varied, fair live proofs..."
                  className="w-full rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-2.5 text-sm focus:outline-none focus:border-[#F16A2E]"
                />
              </div>
              {customError && (
                <div className="text-xs text-[#DC2626] font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{customError}</span>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCustomModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-full text-sm font-medium text-[#6B6663] hover:bg-[#FFF4EE]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#F16A2E] text-white text-sm font-bold hover:bg-[#DC5A20]"
                >
                  Save Habit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};
