import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Compass,
  Flame,
  Plus,
  Search,
  Share2,
  Sparkles,
  ThumbsUp,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { SquadPool, TokenType } from '../types/actake';
import { buildSquadBlinkUrl, buildSquadLobbyUrl } from '../solana/actakeEscrow';

export interface ExploreHabitPreset {
  categoryId: string;
  amount: number;
  token: TokenType;
  alarmHour: number;
  alarmMinute: number;
  motivationNote: string;
}

interface SquadsViewProps {
  squads: SquadPool[];
  onToggleReaction: (squadId: string, feedId: string, kind: 'like' | 'fire') => void;
  onCreateSquad: (squad: SquadPool) => void;
  onOpenSquadLobby: (poolId: string) => void;
  onSelectTemplateToStake: (preset: ExploreHabitPreset) => void;
}

type ExploreSection = 'community' | 'templates' | 'feed';

interface HabitPack {
  id: string;
  group: 'Recommended' | 'Trending' | 'Template';
  title: string;
  subtitle: string;
  membersLabel: string;
  preset: ExploreHabitPreset;
}

const EXPLORE_HABIT_PACKS: HabitPack[] = [
  {
    id: 'pack-sunrise-wake',
    group: 'Trending',
    title: '6:00 AM Sunrise Routine',
    subtitle: 'Beat the snooze button with a randomized morning household proof',
    membersLabel: '1,312 staked',
    preset: {
      categoryId: 'morning_wakeup',
      amount: 10,
      token: 'USDC',
      alarmHour: 6,
      alarmMinute: 0,
      motivationNote: 'Win the first hour of the day before checking social feeds.',
    },
  },
  {
    id: 'pack-gym-pushups',
    group: 'Trending',
    title: 'Daily Gym & Push-Ups Pack',
    subtitle: 'Random mix of push-ups, squats, or gym gear verified live on camera',
    membersLabel: '842 staked',
    preset: {
      categoryId: 'gym_fitness',
      amount: 15,
      token: 'SKR',
      alarmHour: 7,
      alarmMinute: 30,
      motivationNote: 'No skipped sessions—0% fee SKR accountability.',
    },
  },
  {
    id: 'pack-hydration',
    group: 'Recommended',
    title: 'Drink More Water Morning',
    subtitle: 'Start every morning hydrated with a live kitchen or water bottle check-in',
    membersLabel: '620 staked',
    preset: {
      categoryId: 'hydration_kitchen',
      amount: 10,
      token: 'USDC',
      alarmHour: 8,
      alarmMinute: 0,
      motivationNote: 'Full glass of water before my first coffee.',
    },
  },
  {
    id: 'pack-study-sprint',
    group: 'Recommended',
    title: 'Deep Study & Reading Hour',
    subtitle: 'Open physical book, desk notes, or study workspace verified daily',
    membersLabel: '495 staked',
    preset: {
      categoryId: 'reading_study',
      amount: 15,
      token: 'USDC',
      alarmHour: 19,
      alarmMinute: 0,
      motivationNote: 'Read 20 pages or complete one focused study block daily.',
    },
  },
  {
    id: 'pack-touch-grass',
    group: 'Template',
    title: 'Touch Grass Sunlight Walk',
    subtitle: 'Step outside into real daylight and capture living greenery or sidewalk gear',
    membersLabel: '389 staked',
    preset: {
      categoryId: 'outdoors_grass',
      amount: 5,
      token: 'USDC',
      alarmHour: 16,
      alarmMinute: 30,
      motivationNote: 'Get 15 minutes of outdoor sunlight away from screens.',
    },
  },
  {
    id: 'pack-make-bed',
    group: 'Template',
    title: 'Make Bed Immediately',
    subtitle: 'Quick bedroom momentum check within 15 minutes of waking up',
    membersLabel: '518 staked',
    preset: {
      categoryId: 'make_bed',
      amount: 5,
      token: 'SKR',
      alarmHour: 7,
      alarmMinute: 0,
      motivationNote: 'Small daily wins build unstoppable consistency.',
    },
  },
];

export const SquadsView: React.FC<SquadsViewProps> = ({
  squads,
  onToggleReaction,
  onCreateSquad,
  onOpenSquadLobby,
  onSelectTemplateToStake,
}) => {
  const [section, setSection] = useState<ExploreSection>('community');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedSort, setFeedSort] = useState<'recent' | 'popular'>('recent');
  const [selectedSquadId, setSelectedSquadId] = useState<string>(squads[0]?.id || '');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState('06:30');
  const [newAmount, setNewAmount] = useState(10);
  const [newToken, setNewToken] = useState<TokenType>('USDC');

  const q = searchQuery.trim().toLowerCase();

  const filteredSquads = useMemo(() => {
    if (!q) return squads;
    return squads.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.token.toLowerCase().includes(q) ||
        s.alarmTimeLabel.toLowerCase().includes(q)
    );
  }, [squads, q]);

  const filteredPacks = useMemo(() => {
    if (!q) return EXPLORE_HABIT_PACKS;
    return EXPLORE_HABIT_PACKS.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.group.toLowerCase().includes(q)
    );
  }, [q]);

  const activeSquad =
    filteredSquads.find((s) => s.id === selectedSquadId) || filteredSquads[0] || squads[0];

  const allFeedEntries = useMemo(() => {
    const combined = squads.flatMap((sq) =>
      sq.feed.map((item) => ({
        ...item,
        squadId: sq.id,
        squadName: sq.name,
        stakeAmount: sq.stakeAmount,
        token: sq.token,
      }))
    );
    const matches = q
      ? combined.filter(
          (f) =>
            f.memberName.toLowerCase().includes(q) ||
            f.itemVerified.toLowerCase().includes(q) ||
            f.squadName.toLowerCase().includes(q)
        )
      : combined;
    if (feedSort === 'popular') {
      return [...matches].sort((a, b) => b.likes + b.fires - (a.likes + a.fires));
    }
    return matches;
  }, [squads, q, feedSort]);

  const handleCopyBlink = async (squad: SquadPool) => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join ${squad.name} on Actake`,
          text: `Stake $${squad.stakeAmount} ${squad.token} for ${squad.alarmTimeLabel} daily wake-up proof:`,
          url: squad.blinkUrl,
        });
        return;
      }
    } catch {
      // fallback to clipboard
    }
    try {
      await navigator.clipboard.writeText(squad.blinkUrl);
      setCopiedId(squad.id);
      window.setTimeout(() => setCopiedId(null), 2200);
    } catch {
      // ignore
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;

    const [hStr, mStr] = newTime.split(':');
    const h = Number(hStr) || 7;
    const m = Number(mStr) || 0;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const timeLabel = `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;

    const slugId =
      trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 24) + `-${Date.now().toString(36)}`;

    const squad: SquadPool = {
      id: slugId,
      name: trimmed,
      alarmTimeLabel: timeLabel,
      alarmHour: h,
      alarmMinute: m,
      stakeAmount: newAmount,
      token: newToken,
      memberCount: 1,
      checkedInPct: 100,
      totalPot: newAmount,
      slashedPot: 0,
      blinkUrl: buildSquadBlinkUrl({
        poolId: slugId,
        squadName: trimmed,
        amount: newAmount,
        token: newToken,
        alarmTime: timeLabel,
      }),
      lobbyUrl: buildSquadLobbyUrl(slugId),
      feed: [
        {
          id: `feed-init-${Date.now()}`,
          memberName: 'You',
          initials: 'YO',
          timeLabel: 'Pool Created',
          streak: 1,
          itemVerified: `Locked $${newAmount} ${newToken} · Waiting for community members`,
          status: 'verified',
          likes: 1,
          fires: 1,
        },
      ],
    };

    onCreateSquad(squad);
    setSelectedSquadId(squad.id);
    setNewName('');
    setCreateOpen(false);
    setSection('community');
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Explore & Community Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#F16A2E]">
            Explore Habits &amp; Communities
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
            Explore &amp; Join Stakes
          </h1>
          <p className="text-sm text-[#6B6663] mt-0.5">
            Discover trending routines, join community pools via Solana Blinks, or cheer live proofs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center gap-2 self-start sm:self-auto whitespace-nowrap transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Create Community Pool</span>
        </button>
      </div>

      {/* Search Bar + Sub-Section Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#877F7A] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search community pools, habits, or members..."
            className="w-full min-h-[44px] pl-11 pr-4 rounded-full bg-white text-sm text-[#111114] placeholder:text-[#9A938E] shadow-[0_4px_14px_rgba(24,20,18,0.05)] focus:outline-none focus:ring-2 focus:ring-[#F16A2E]/30"
          />
        </div>

        <div className="inline-flex items-center p-1 rounded-full bg-white shadow-[0_4px_14px_rgba(24,20,18,0.05)] self-start">
          {(
            [
              { id: 'community', label: `Pools (${squads.length})` },
              { id: 'templates', label: 'Templates & Trending' },
              { id: 'feed', label: 'Social Feed' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                section === tab.id
                  ? 'bg-[#F16A2E] text-white'
                  : 'text-[#6B6663] hover:text-[#111114]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: COMMUNITY STAKING POOLS */}
      {section === 'community' && activeSquad && (
        <div className="space-y-5">
          {/* Pool Selector Strip */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {filteredSquads.map((sq) => {
              const isSelected = sq.id === activeSquad.id;
              return (
                <button
                  key={sq.id}
                  type="button"
                  onClick={() => setSelectedSquadId(sq.id)}
                  className={`min-h-[40px] px-4 py-2 rounded-full text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-[#111114] text-white'
                      : 'bg-white text-[#6B6663] hover:text-[#111114] shadow-[0_4px_12px_rgba(24,20,18,0.04)]'
                  }`}
                >
                  {sq.name} · ${sq.stakeAmount} {sq.token}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Progress, Live Pot & Solana Blink */}
            <div className="lg:col-span-5 space-y-4">
              <div className="actake-card p-6 space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[#F16A2E]">
                      Daily Cutoff · {activeSquad.alarmTimeLabel}
                    </div>
                    <h2 className="font-display text-xl font-extrabold text-[#111114] mt-0.5">
                      {activeSquad.name}
                    </h2>
                  </div>
                  <span className="font-mono text-lg font-bold text-[#16A34A] tabular-nums">
                    {activeSquad.checkedInPct}%
                  </span>
                </div>

                <div className="h-2.5 w-full rounded-full bg-[#F7ECE6] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#16A34A] transition-all"
                    style={{ width: `${activeSquad.checkedInPct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#F4ECE7]">
                  <div className="flex items-center -space-x-2">
                    {['AL', 'SA', 'NI'].map((init) => (
                      <div
                        key={init}
                        className="w-9 h-9 rounded-full bg-[#111114] text-white text-xs font-bold flex items-center justify-center border-2 border-white"
                      >
                        {init}
                      </div>
                    ))}
                    <div className="w-9 h-9 rounded-full bg-[#FFE3D5] text-[#F16A2E] text-xs font-bold flex items-center justify-center border-2 border-white tabular-nums">
                      +{Math.max(0, activeSquad.memberCount - 3)}
                    </div>
                  </div>

                  <div className="text-right tabular-nums">
                    <div className="text-[11px] font-medium text-[#6B6663]">Live Pot</div>
                    <div className="text-sm font-bold text-[#111114]">
                      <span className="text-[#16A34A]">${activeSquad.totalPot} Total</span>
                      <span className="mx-1.5 text-[#D6CBC4]">·</span>
                      <span className="text-[#DC2626]">${activeSquad.slashedPot} Slashed</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Solana Blink & Web Lobby Card */}
              <div className="rounded-[28px] bg-[#141416] text-white p-6 space-y-3.5 shadow-[0_14px_32px_rgba(17,17,20,0.16)]">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Users className="w-4 h-4 text-[#F16A2E]" />
                  <span>Invite via Solana Blink</span>
                </div>
                <p className="text-xs text-white/75 leading-relaxed">
                  Share one Blink link in X, Telegram, or WhatsApp—or open the public Web Lobby to
                  match the stake and check in from any browser.
                </p>
                <div className="rounded-2xl bg-white/10 px-3.5 py-2 font-mono text-[11px] text-white/80 truncate">
                  {activeSquad.blinkUrl}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleCopyBlink(activeSquad)}
                    className="min-h-[44px] rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    {copiedId === activeSquad.id ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Blink Copied</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4" />
                        <span>Share Blink</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSquadLobby(activeSquad.id)}
                    className="min-h-[44px] rounded-full bg-white text-[#111114] hover:bg-[#FFF4EE] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Open Web Lobby</span>
                    <ArrowUpRight className="w-4 h-4 text-[#F16A2E]" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Pool Activity Feed */}
            <div className="lg:col-span-7 actake-card overflow-hidden">
              <div className="px-6 py-4 border-b border-[#F4ECE7] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-[#6B6663]">Verified Check-Ins</div>
                  <h3 className="font-display text-lg font-extrabold text-[#111114]">
                    {activeSquad.name}
                  </h3>
                </div>
                <div className="text-xs font-bold text-[#111114] tabular-nums">
                  ${activeSquad.stakeAmount} {activeSquad.token} stake · ${activeSquad.totalPot} pot
                </div>
              </div>

              <div className="divide-y divide-[#F6EFEA]">
                {activeSquad.feed.map((item) => (
                  <div key={item.id} className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
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
                            <span className="text-xs font-mono text-[#6B6663] tabular-nums">
                              {item.timeLabel}
                            </span>
                            {item.status === 'verified' && item.streak > 0 && (
                              <>
                                <span className="text-[#A09A96] font-normal">·</span>
                                <span className="text-xs font-semibold text-[#F16A2E] tabular-nums">
                                  {item.streak}d streak
                                </span>
                              </>
                            )}
                          </div>
                          <div
                            className={`text-xs mt-0.5 ${
                              item.status === 'missed'
                                ? 'text-[#DC2626] font-semibold'
                                : 'text-[#6B6663]'
                            }`}
                          >
                            {item.status === 'missed'
                              ? `Missed deadline · -$${(item.slashedAmount ?? activeSquad.stakeAmount).toFixed(2)} slashed to pool`
                              : item.itemVerified}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {item.status === 'verified' ? (
                          <CheckCircle2 className="w-6 h-6 text-[#16A34A]" />
                        ) : (
                          <XCircle className="w-6 h-6 text-[#DC2626]" />
                        )}
                      </div>
                    </div>

                    {item.status === 'verified' && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleReaction(activeSquad.id, item.id, 'like')}
                          className={`min-h-[34px] px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors tabular-nums ${
                            item.userLiked
                              ? 'bg-[#FFF0E6] text-[#F16A2E]'
                              : 'bg-[#FFF8F4] text-[#6B6663] hover:text-[#111114]'
                          }`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span>{item.likes}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleReaction(activeSquad.id, item.id, 'fire')}
                          className={`min-h-[34px] px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors tabular-nums ${
                            item.userFired
                              ? 'bg-[#FFF0E6] text-[#F16A2E]'
                              : 'bg-[#FFF8F4] text-[#6B6663] hover:text-[#111114]'
                          }`}
                        >
                          <Flame className="w-3.5 h-3.5" />
                          <span>{item.fires}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: TEMPLATES, RECOMMENDED & TRENDING HABITS */}
      {section === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPacks.map((pack) => (
            <div
              key={pack.id}
              className="actake-card p-6 flex flex-col justify-between gap-5"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#F16A2E] inline-flex items-center gap-1">
                    {pack.group === 'Trending' ? (
                      <Flame className="w-3.5 h-3.5" />
                    ) : pack.group === 'Recommended' ? (
                      <Sparkles className="w-3.5 h-3.5" />
                    ) : (
                      <Compass className="w-3.5 h-3.5" />
                    )}
                    {pack.group}
                  </span>
                  <span className="text-[#6B6663] tabular-nums">{pack.membersLabel}</span>
                </div>

                <h3 className="font-display text-lg font-extrabold text-[#111114]">
                  {pack.title}
                </h3>
                <p className="text-xs text-[#6B6663] leading-relaxed">{pack.subtitle}</p>
              </div>

              <div className="pt-3 border-t border-[#F4ECE7] flex items-center justify-between gap-3">
                <div className="text-xs font-mono font-bold text-[#111114] tabular-nums">
                  ${pack.preset.amount} {pack.preset.token}
                  <span className="text-[#877F7A] font-sans font-normal">
                    {' '}
                    · {String(pack.preset.alarmHour).padStart(2, '0')}:
                    {String(pack.preset.alarmMinute).padStart(2, '0')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectTemplateToStake(pack.preset)}
                  className="min-h-[38px] px-4 py-1.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold transition-colors whitespace-nowrap"
                >
                  Stake &amp; Join
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SECTION 3: COMMUNITY SOCIAL FEED (Recent / Popular) */}
      {section === 'feed' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedSort('recent')}
              className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                feedSort === 'recent'
                  ? 'bg-[#111114] text-white'
                  : 'bg-white text-[#6B6663] hover:text-[#111114]'
              }`}
            >
              Recent Proofs
            </button>
            <button
              type="button"
              onClick={() => setFeedSort('popular')}
              className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                feedSort === 'popular'
                  ? 'bg-[#111114] text-white'
                  : 'bg-white text-[#6B6663] hover:text-[#111114]'
              }`}
            >
              Popular
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allFeedEntries.map((item) => (
              <div key={`${item.squadId}-${item.id}`} className="actake-card p-5 space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
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
                      <div className="text-sm font-bold text-[#111114] truncate">
                        {item.memberName}
                      </div>
                      <div className="text-xs text-[#6B6663] truncate">
                        {item.squadName} · {item.timeLabel}
                      </div>
                    </div>
                  </div>
                  {item.status === 'verified' ? (
                    <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-[#DC2626] shrink-0" />
                  )}
                </div>

                <div className="rounded-2xl bg-[#FFF8F4] p-3.5 text-xs text-[#111114]">
                  {item.status === 'missed'
                    ? `Missed deadline · -$${(item.slashedAmount ?? item.stakeAmount).toFixed(2)} ${item.token} slashed`
                    : `${item.itemVerified} · ${item.streak} day streak verified`}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenSquadLobby(item.squadId)}
                    className="text-xs font-bold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                  >
                    <span>View Pool</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>

                  {item.status === 'verified' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleReaction(item.squadId, item.id, 'like')}
                        className={`min-h-[34px] px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 tabular-nums ${
                          item.userLiked
                            ? 'bg-[#FFF0E6] text-[#F16A2E]'
                            : 'bg-[#FFF8F4] text-[#6B6663]'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>{item.likes}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleReaction(item.squadId, item.id, 'fire')}
                        className={`min-h-[34px] px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 tabular-nums ${
                          item.userFired
                            ? 'bg-[#FFF0E6] text-[#F16A2E]'
                            : 'bg-[#FFF8F4] text-[#6B6663]'
                        }`}
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>{item.fires}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Community Pool Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-[#111114]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-[#111114]">
                Launch Community Stake Pool
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="w-9 h-9 rounded-full bg-[#FFF4EE] flex items-center justify-center text-[#111114]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111114] mb-1">
                  Community Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., 6AM Founders Sprint"
                  className="w-full rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-2.5 text-sm focus:outline-none focus:border-[#F16A2E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111114] mb-1">
                    Daily Cutoff Time
                  </label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F16A2E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111114] mb-1">
                    Stake Per Member
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={newAmount}
                    onChange={(e) => setNewAmount(Math.max(5, Number(e.target.value)))}
                    className="w-full rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F16A2E]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111114] mb-1.5">
                  Pool Token
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['USDC', 'SKR'] as TokenType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewToken(t)}
                      className={`min-h-[42px] rounded-full text-xs font-bold transition-colors ${
                        newToken === t
                          ? 'bg-[#111114] text-white'
                          : 'bg-[#FFF4EE] text-[#111114]'
                      }`}
                    >
                      {t === 'SKR' ? 'SKR (0% Fee)' : 'USDC (SPL)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 rounded-full text-sm font-medium text-[#6B6663] hover:bg-[#FFF4EE]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-[#F16A2E] text-white text-sm font-bold hover:bg-[#DC5A20]"
                >
                  Create &amp; Generate Blink
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
