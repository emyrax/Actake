import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Award,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Crown,
  Flame,
  Info,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Trophy,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { SquadMemberStanding, SquadPool, TokenType } from '../types/actake';
import { buildSquadBlinkUrl, buildSquadLobbyUrl } from '../solana/actakeEscrow';
import { MascotDisplay } from './MascotDisplay';
import { EmptyState } from './UiPrimitives';

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

type ExploreSection = 'templates' | 'feed' | 'community';
type LeaderboardFilter = 'all' | 'verified' | 'active' | 'slashed';
type PoolRightView = 'leaderboard' | 'feed';

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

interface EnrichedPoolMeta {
  categoryLabel: string;
  description: string;
  verificationRule: string;
  durationDays: number;
  slashRule: string;
  members: SquadMemberStanding[];
}

const KNOWN_POOL_DEFAULTS: Record<string, Partial<EnrichedPoolMeta>> = {
  'squad-7am-club': {
    categoryLabel: 'Morning Routine · 7-Day Sprint',
    description:
      'Built for students and early risers who want to kill the snooze button for good. Beat the 7:00 AM daily cutoff by scanning a randomized morning household item on live camera—anyone who sleeps through forfeits their $10 USDC stake directly into the winners’ bonus pot.',
    verificationRule:
      '15-min live AI camera window before 07:00 AM · Randomized morning item (mug, toothbrush, sink, window) · Live depth anti-cheat.',
    durationDays: 7,
    members: [
      {
        id: 'mem-sarah',
        memberName: 'Sarah',
        initials: 'SA',
        walletHint: 'Sara...9uE7',
        status: 'verified',
        checkinsCompleted: 7,
        totalDays: 7,
        streakDays: 32,
        stakedAmount: 10,
        lastProofLabel: 'Gym Dumbbell · 06:12 AM',
        likes: 11,
        fires: 7,
      },
      {
        id: 'mem-alex',
        memberName: 'Alex',
        initials: 'AL',
        walletHint: 'Alex...Club',
        status: 'verified',
        checkinsCompleted: 6,
        totalDays: 7,
        streakDays: 14,
        stakedAmount: 10,
        lastProofLabel: 'Toothbrush Scanned · 05:58 AM',
        likes: 8,
        fires: 5,
      },
      {
        id: 'mem-priya',
        memberName: 'Priya',
        initials: 'PR',
        walletHint: 'Priy...4mK2',
        status: 'verified',
        checkinsCompleted: 6,
        totalDays: 7,
        streakDays: 11,
        stakedAmount: 10,
        lastProofLabel: 'Coffee Mug Verified · 06:24 AM',
        likes: 6,
        fires: 4,
      },
      {
        id: 'mem-devon',
        memberName: 'Devon',
        initials: 'DE',
        walletHint: 'Devo...8vP1',
        status: 'active',
        checkinsCompleted: 5,
        totalDays: 7,
        streakDays: 5,
        stakedAmount: 10,
        lastProofLabel: 'Awaiting today’s 07:00 AM check-in',
      },
      {
        id: 'mem-marcus',
        memberName: 'Marcus',
        initials: 'MA',
        walletHint: 'Marc...5dF1',
        status: 'slashed',
        checkinsCompleted: 3,
        totalDays: 7,
        streakDays: 0,
        stakedAmount: 10,
        lastProofLabel: 'Missed deadline · No photo submitted',
        slashedAmount: 10,
      },
      {
        id: 'mem-kyle',
        memberName: 'Kyle',
        initials: 'KY',
        walletHint: 'Kyle...2rT9',
        status: 'slashed',
        checkinsCompleted: 2,
        totalDays: 7,
        streakDays: 0,
        stakedAmount: 10,
        lastProofLabel: 'Missed deadline · Snoozed past 07:00 AM',
        slashedAmount: 10,
      },
    ],
  },
  'squad-skr-builders': {
    categoryLabel: 'Builders & Fitness · 14-Day Cycle',
    description:
      'High-conviction 6:00 AM accountability pool for Solana founders, engineers, and athletes staking $25 SKR at 0% protocol fee. Check in daily with a live workout or desk-ready camera proof to keep your principal and split every missed builder’s slashed SKR stake.',
    verificationRule:
      '15-min live AI camera window before 06:00 AM · Workout gear, coffee mug, or open study desk · 0% protocol fee on SKR.',
    durationDays: 14,
    members: [
      {
        id: 'mem-nina',
        memberName: 'Nina',
        initials: 'NI',
        walletHint: 'Nina...5tH2',
        status: 'verified',
        checkinsCompleted: 13,
        totalDays: 14,
        streakDays: 21,
        stakedAmount: 25,
        lastProofLabel: 'Coffee Mug Verified · 05:54 AM',
        likes: 6,
        fires: 9,
      },
      {
        id: 'mem-tomas',
        memberName: 'Tomas',
        initials: 'TO',
        walletHint: 'Toma...8kL4',
        status: 'verified',
        checkinsCompleted: 12,
        totalDays: 14,
        streakDays: 18,
        stakedAmount: 25,
        lastProofLabel: 'Kettlebell & Mat · 05:49 AM',
        likes: 5,
        fires: 7,
      },
      {
        id: 'mem-hana',
        memberName: 'Hana',
        initials: 'HA',
        walletHint: 'Hana...3xW9',
        status: 'verified',
        checkinsCompleted: 11,
        totalDays: 14,
        streakDays: 12,
        stakedAmount: 25,
        lastProofLabel: 'Notebook & Lamp · 05:57 AM',
        likes: 4,
        fires: 5,
      },
      {
        id: 'mem-omar',
        memberName: 'Omar',
        initials: 'OM',
        walletHint: 'Omar...7qR2',
        status: 'active',
        checkinsCompleted: 10,
        totalDays: 14,
        streakDays: 10,
        stakedAmount: 25,
        lastProofLabel: 'Locked in · Next check-in 06:00 AM',
      },
      {
        id: 'mem-jules',
        memberName: 'Jules',
        initials: 'JU',
        walletHint: 'Jule...1nV8',
        status: 'slashed',
        checkinsCompleted: 6,
        totalDays: 14,
        streakDays: 0,
        stakedAmount: 25,
        lastProofLabel: 'Missed 06:00 AM deadline · Slashed to pool',
        slashedAmount: 25,
      },
    ],
  },
};

const STATUS_RANK_WEIGHT: Record<SquadMemberStanding['status'], number> = {
  verified: 0,
  active: 1,
  slashed: 2,
};

function rankMembersByStatus(members: SquadMemberStanding[]): SquadMemberStanding[] {
  return [...members].sort((a, b) => {
    const statusDiff = STATUS_RANK_WEIGHT[a.status] - STATUS_RANK_WEIGHT[b.status];
    if (statusDiff !== 0) return statusDiff;
    if (b.checkinsCompleted !== a.checkinsCompleted) {
      return b.checkinsCompleted - a.checkinsCompleted;
    }
    if (b.streakDays !== a.streakDays) return b.streakDays - a.streakDays;
    return (b.likes || 0) + (b.fires || 0) - ((a.likes || 0) + (a.fires || 0));
  });
}

function resolvePoolMeta(squad: SquadPool): EnrichedPoolMeta {
  const known = KNOWN_POOL_DEFAULTS[squad.id];
  const durationDays = squad.durationDays ?? known?.durationDays ?? 7;
  const categoryLabel =
    squad.categoryLabel || known?.categoryLabel || `Community Pool · ${durationDays}-Day Cycle`;
  const description =
    squad.description ||
    known?.description ||
    `Daily accountability pool requiring every member to stake $${squad.stakeAmount} ${squad.token} and verify live camera proof before ${squad.alarmTimeLabel}. Members who beat the daily cutoff keep 100% of their stake and split the slashed bonus pot from anyone who misses.`;
  const verificationRule =
    squad.verificationRule ||
    known?.verificationRule ||
    `15-min live AI camera check-in window before ${squad.alarmTimeLabel} · Randomized object or action prompt with Ed25519 oracle attestation.`;
  const slashRule =
    squad.token === 'SKR'
      ? 'Verified members reclaim 100% principal + pro-rata share of slashed stakes (0% SKR protocol fee).'
      : 'Verified members reclaim 100% principal + pro-rata share of slashed stakes (1.5% USDC protocol fee).';

  let rawMembers: SquadMemberStanding[] = [];
  if (squad.members && squad.members.length > 0) {
    rawMembers = squad.members;
  } else if (known?.members && known.members.length > 0) {
    rawMembers = known.members;
  } else {
    rawMembers = squad.feed.map((f, index) => ({
      id: `derived-${f.id}`,
      memberName: f.memberName,
      initials: f.initials,
      status: f.status === 'missed' ? 'slashed' : 'verified',
      checkinsCompleted:
        f.status === 'missed'
          ? Math.max(1, Math.floor(durationDays / 3))
          : Math.min(durationDays, Math.max(1, durationDays - index)),
      totalDays: durationDays,
      streakDays: f.streak,
      stakedAmount: squad.stakeAmount,
      lastProofLabel:
        f.status === 'missed'
          ? `Missed deadline · ${f.itemVerified}`
          : `${f.itemVerified} · ${f.timeLabel}`,
      slashedAmount: f.status === 'missed' ? (f.slashedAmount ?? squad.stakeAmount) : undefined,
      likes: f.likes,
      fires: f.fires,
    }));
  }

  return {
    categoryLabel,
    description,
    verificationRule,
    durationDays,
    slashRule,
    members: rankMembersByStatus(rawMembers),
  };
}

export const SquadsView: React.FC<SquadsViewProps> = ({
  squads,
  onToggleReaction,
  onCreateSquad,
  onOpenSquadLobby,
  onSelectTemplateToStake,
}) => {
  // Templates tab comes first as the default Explore landing tab; Pools is the last tab
  const [section, setSection] = useState<ExploreSection>('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedSort, setFeedSort] = useState<'recent' | 'popular'>('recent');
  const [openedPoolId, setOpenedPoolId] = useState<string | null>(null);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [leaderboardFilter, setLeaderboardFilter] = useState<LeaderboardFilter>('all');
  const [poolRightView, setPoolRightView] = useState<PoolRightView>('leaderboard');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTime, setNewTime] = useState('06:30');
  const [newAmount, setNewAmount] = useState(10);
  const [newToken, setNewToken] = useState<TokenType>('USDC');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    setAboutExpanded(false);
    if (openedPoolId) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [openedPoolId]);

  const q = searchQuery.trim().toLowerCase();

  const filteredSquads = useMemo(() => {
    if (!q) return squads;
    return squads.filter((s) => {
      const meta = resolvePoolMeta(s);
      return (
        s.name.toLowerCase().includes(q) ||
        s.token.toLowerCase().includes(q) ||
        s.alarmTimeLabel.toLowerCase().includes(q) ||
        meta.description.toLowerCase().includes(q) ||
        meta.categoryLabel.toLowerCase().includes(q)
      );
    });
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

  const activeSquad = useMemo(
    () => (openedPoolId ? squads.find((s) => s.id === openedPoolId) || null : null),
    [squads, openedPoolId]
  );

  const activePoolMeta = useMemo(
    () => (activeSquad ? resolvePoolMeta(activeSquad) : null),
    [activeSquad]
  );

  const rankedMembers = activePoolMeta?.members || [];
  const verifiedMemberCount = rankedMembers.filter((m) => m.status === 'verified').length;
  const activeMemberCount = rankedMembers.filter((m) => m.status === 'active').length;
  const slashedMemberCount = rankedMembers.filter((m) => m.status === 'slashed').length;
  const estBonusPerWinner =
    activeSquad && verifiedMemberCount + activeMemberCount > 0
      ? activeSquad.slashedPot / Math.max(1, verifiedMemberCount + activeMemberCount)
      : 0;

  const filteredLeaderboardMembers = useMemo(() => {
    if (leaderboardFilter === 'all') return rankedMembers;
    return rankedMembers.filter((m) => m.status === leaderboardFilter);
  }, [rankedMembers, leaderboardFilter]);

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
    setCreateError(null);
    const trimmed = newName.trim();
    if (trimmed.length < 3) {
      setCreateError('Give your community pool a name (at least 3 characters).');
      return;
    }
    if (!Number.isFinite(newAmount) || newAmount < 5 || newAmount > 500) {
      setCreateError('Stake per member must be between $5 and $500.');
      return;
    }

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

    const customDescription =
      newDescription.trim() ||
      `Custom accountability squad staking $${newAmount} ${newToken} with a daily ${timeLabel} live camera proof cutoff. Verified members keep their stake and split any slashed balances.`;

    const squad: SquadPool = {
      id: slugId,
      name: trimmed,
      categoryLabel: 'Custom Squad · 7-Day Sprint',
      description: customDescription,
      verificationRule: `15-min live AI camera window before ${timeLabel} · Randomized daily item check-in.`,
      durationDays: 7,
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
      members: [
        {
          id: `mem-creator-${Date.now()}`,
          memberName: 'You (Founder)',
          initials: 'YO',
          status: 'verified',
          checkinsCompleted: 1,
          totalDays: 7,
          streakDays: 1,
          stakedAmount: newAmount,
          lastProofLabel: `Locked $${newAmount} ${newToken} · Pool launched`,
          likes: 1,
          fires: 1,
        },
      ],
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
    setOpenedPoolId(squad.id);
    setLeaderboardFilter('all');
    setPoolRightView('leaderboard');
    setNewName('');
    setNewDescription('');
    setCreateOpen(false);
    setSection('community');
  };

  // DEDICATED FULL-SCREEN POOL DETAIL SCREEN (opens when user clicks any pool)
  if (activeSquad && activePoolMeta) {
    return (
      <div className="space-y-6 pb-10">
        {/* Top Back Navigation & Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpenedPoolId(null)}
            className="min-h-[44px] px-4 py-2 rounded-full bg-white border border-[#EFE2D9] text-xs font-bold text-[#111114] hover:bg-[#FFF9F5] inline-flex items-center gap-2 transition-colors shadow-[0_4px_14px_rgba(24,20,18,0.04)]"
          >
            <ArrowLeft className="w-4 h-4 text-[#F16A2E]" />
            <span>Back to Pools</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyBlink(activeSquad)}
              aria-label={copiedId === activeSquad.id ? 'Pool link copied' : 'Share pool'}
              title={copiedId === activeSquad.id ? 'Link copied' : 'Share pool'}
              className="w-11 h-11 rounded-full bg-white border border-[#EFE2D9] hover:border-[#F16A2E]/60 hover:bg-[#FFF9F5] text-[#111114] inline-flex items-center justify-center transition-colors shadow-[0_4px_14px_rgba(24,20,18,0.04)] shrink-0"
            >
              {copiedId === activeSquad.id ? (
                <Check className="w-4 h-4 text-[#16A34A]" />
              ) : (
                <Share2 className="w-4 h-4 text-[#111114]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onOpenSquadLobby(activeSquad.id)}
              className="min-h-[44px] px-4 py-2 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <span>Join &amp; Check In</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dedicated Pool Hero Banner */}
        <section className="relative overflow-hidden rounded-[28px] bg-[#141416] text-white p-6 sm:p-7 shadow-[0_14px_34px_rgba(17,17,20,0.18)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full actake-orb-glow opacity-30 blur-2xl"
          />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-start sm:items-center gap-4 min-w-0">
              <MascotDisplay
                variant="obsidian"
                size="md"
                floating
                alt={`${activeSquad.name} Mascot`}
              />
              <div className="space-y-1.5 min-w-0">
                <div className="text-xs font-bold text-[#F16A2E]">
                  {activePoolMeta.categoryLabel} · Daily {activeSquad.alarmTimeLabel} Cutoff
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                  {activeSquad.name}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm tabular-nums text-white/85">
                  <span className="font-bold text-[#4ADE80]">
                    ${activeSquad.totalPot.toFixed(0)} {activeSquad.token} Pot
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    ${activeSquad.stakeAmount} {activeSquad.token} Entry
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#FCA5A5]">
                    +${activeSquad.slashedPot.toFixed(0)} Slashed Bonus
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeSquad.memberCount} Members</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
              <span className="px-3.5 py-1.5 rounded-full bg-[#16A34A]/20 border border-[#16A34A]/35 text-[#4ADE80] font-mono text-xs font-extrabold tabular-nums">
                {activeSquad.checkedInPct}% verified today
              </span>
            </div>
          </div>
        </section>

        {/* 1st Component: Collapsible "About This Pool" (collapsed by default) */}
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
                    ? 'Pool rules, verification window & payout breakdown'
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
            <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-[#F4ECE7] space-y-5">
              <p className="text-xs sm:text-sm text-[#4F4A47] leading-relaxed">
                {activePoolMeta.description}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-4 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-[#F16A2E] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-[#111114] mb-0.5">Daily Cutoff &amp; Proof</div>
                    <p className="text-[#6B6663] leading-relaxed">
                      {activePoolMeta.verificationRule}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-4 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-[#111114] mb-0.5">Payout &amp; Slashing</div>
                    <p className="text-[#6B6663] leading-relaxed">{activePoolMeta.slashRule}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center tabular-nums">
                <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3.5">
                  <div className="text-[11px] font-semibold text-[#6B6663]">Total Pool Pot</div>
                  <div className="font-display text-lg font-extrabold text-[#111114] mt-0.5">
                    ${activeSquad.totalPot.toFixed(0)} {activeSquad.token}
                  </div>
                  <div className="text-[11px] text-[#877F7A]">
                    ${activeSquad.stakeAmount} entry · {activeSquad.memberCount} members
                  </div>
                </div>

                <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-3.5">
                  <div className="text-[11px] font-semibold text-[#991B1B]">
                    Slashed Bonus Pot
                  </div>
                  <div className="font-display text-lg font-extrabold text-[#DC2626] mt-0.5">
                    +${activeSquad.slashedPot.toFixed(0)} {activeSquad.token}
                  </div>
                  <div className="text-[11px] text-[#B91C1C]">
                    Est. +${estBonusPerWinner.toFixed(2)} / winner
                  </div>
                </div>

                <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#6B6663]">Today’s Completion</span>
                    <span className="font-bold text-[#16A34A]">{activeSquad.checkedInPct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#F7ECE6] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#16A34A] transition-all"
                      style={{ width: `${activeSquad.checkedInPct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-[#877F7A]">
                    {activePoolMeta.durationDays}-day challenge cycle
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 2nd Component: Status-Ranked Pool Leaderboard + Live Proof Feed Toggle */}
        <section className="actake-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F4ECE7] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-[#F16A2E] inline-flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Ranked by Member Status &amp; Consistency</span>
                  </div>
                  <h2 className="font-display text-lg font-extrabold text-[#111114] mt-0.5">
                    {activeSquad.name} Leaderboard
                  </h2>
                </div>

                <div className="inline-flex items-center p-0.5 rounded-full bg-[#FFF8F4] border border-[#EFE2D9]">
                  <button
                    type="button"
                    onClick={() => setPoolRightView('leaderboard')}
                    className={`min-h-[34px] px-3.5 rounded-full text-xs font-bold transition-colors ${
                      poolRightView === 'leaderboard'
                        ? 'bg-[#111114] text-white'
                        : 'text-[#6B6663] hover:text-[#111114]'
                    }`}
                  >
                    Leaderboard ({rankedMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPoolRightView('feed')}
                    className={`min-h-[34px] px-3.5 rounded-full text-xs font-bold transition-colors ${
                      poolRightView === 'feed'
                        ? 'bg-[#111114] text-white'
                        : 'text-[#6B6663] hover:text-[#111114]'
                    }`}
                  >
                    Live Proofs ({activeSquad.feed.length})
                  </button>
                </div>
              </div>

              {poolRightView === 'leaderboard' && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: `All (${rankedMembers.length})` },
                        { id: 'verified', label: `Verified (${verifiedMemberCount})` },
                        { id: 'active', label: `Active (${activeMemberCount})` },
                        { id: 'slashed', label: `Slashed (${slashedMemberCount})` },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setLeaderboardFilter(f.id)}
                        className={`min-h-[32px] px-3 py-1 rounded-full text-[11px] font-bold transition-colors border ${
                          leaderboardFilter === f.id
                            ? 'bg-[#111114] border-[#111114] text-white'
                            : 'bg-white border-[#EFE2D9] text-[#6B6663] hover:text-[#111114]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-[#877F7A]">
                    Verified → Active → Slashed
                  </span>
                </div>
              )}
            </div>

            {poolRightView === 'leaderboard' ? (
              filteredLeaderboardMembers.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="text-xs font-semibold text-[#6B6663]">
                    No members currently in the “{leaderboardFilter}” status group.
                  </p>
                  <button
                    type="button"
                    onClick={() => setLeaderboardFilter('all')}
                    className="min-h-[38px] px-4 rounded-full bg-[#FFF4EE] text-xs font-bold text-[#F16A2E] hover:bg-[#FFE5D6] transition-colors"
                  >
                    Show Full Leaderboard
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#F6EFEA]">
                  {filteredLeaderboardMembers.map((member) => {
                    const globalRank =
                      rankedMembers.findIndex((m) => m.id === member.id) + 1;
                    const completionPct = Math.min(
                      100,
                      Math.round((member.checkinsCompleted / Math.max(1, member.totalDays)) * 100)
                    );
                    const isTopWinner = member.status !== 'slashed' && globalRank <= 3;

                    return (
                      <div
                        key={member.id}
                        className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-colors ${
                          member.status === 'slashed'
                            ? 'bg-[#FEF2F2]/45'
                            : globalRank === 1
                              ? 'bg-[#FFFBEB]/55'
                              : ''
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-mono text-xs font-extrabold tabular-nums ${
                              member.status === 'slashed'
                                ? 'bg-[#FEE2E2] text-[#DC2626]'
                                : globalRank === 1
                                  ? 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
                                  : globalRank === 2
                                    ? 'bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]'
                                    : globalRank === 3
                                      ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FED7AA]'
                                      : 'bg-[#FFF8F4] text-[#6B6663] border border-[#F2E3DA]'
                            }`}
                            title={`Rank #${globalRank}`}
                          >
                            {member.status !== 'slashed' && globalRank === 1 ? (
                              <Crown className="w-4 h-4" />
                            ) : isTopWinner ? (
                              <Award className="w-4 h-4" />
                            ) : (
                              `#${globalRank}`
                            )}
                          </div>

                          <div
                            className={`w-10 h-10 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                              member.status === 'verified'
                                ? 'bg-[#111114] text-white'
                                : member.status === 'active'
                                  ? 'bg-[#FFF2EA] text-[#F16A2E] border border-[#F16A2E]/25'
                                  : 'bg-[#FEE2E2] text-[#991B1B]'
                            }`}
                          >
                            {member.initials}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-bold text-[#111114] truncate">
                                {member.memberName}
                              </span>
                              {member.walletHint && (
                                <span className="text-[11px] font-mono text-[#877F7A]">
                                  {member.walletHint}
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  member.status === 'verified'
                                    ? 'bg-[#ECFDF5] text-[#15803D]'
                                    : member.status === 'active'
                                      ? 'bg-[#FFF7ED] text-[#C2410C]'
                                      : 'bg-[#FEE2E2] text-[#DC2626]'
                                }`}
                              >
                                {member.status === 'verified' ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : member.status === 'active' ? (
                                  <Clock className="w-3 h-3" />
                                ) : (
                                  <XCircle className="w-3 h-3" />
                                )}
                                <span>
                                  {member.status === 'verified'
                                    ? 'Verified'
                                    : member.status === 'active'
                                      ? 'Active'
                                      : 'Slashed'}
                                </span>
                              </span>
                            </div>

                            <div
                              className={`text-xs truncate ${
                                member.status === 'slashed'
                                  ? 'text-[#B91C1C] font-medium'
                                  : 'text-[#6B6663]'
                              }`}
                            >
                              {member.lastProofLabel}
                            </div>

                            <div className="flex items-center gap-2 pt-0.5 max-w-[220px]">
                              <div className="h-1.5 flex-1 rounded-full bg-[#F3E7DF] overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    member.status === 'slashed'
                                      ? 'bg-[#EF4444]'
                                      : member.status === 'verified'
                                        ? 'bg-[#16A34A]'
                                        : 'bg-[#F16A2E]'
                                  }`}
                                  style={{ width: `${completionPct}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono font-bold text-[#6B6663] tabular-nums shrink-0">
                                {member.checkinsCompleted}/{member.totalDays}d
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 pl-12 sm:pl-0 shrink-0 tabular-nums">
                          {member.status === 'slashed' ? (
                            <>
                              <div className="text-xs font-extrabold text-[#DC2626]">
                                -${(member.slashedAmount ?? member.stakedAmount).toFixed(2)}{' '}
                                {activeSquad.token}
                              </div>
                              <div className="text-[11px] font-semibold text-[#991B1B]">
                                Forfeited to pot
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-xs font-extrabold text-[#16A34A]">
                                +${estBonusPerWinner.toFixed(2)} est. split
                              </div>
                              <div className="text-[11px] font-semibold text-[#F16A2E] inline-flex items-center gap-1">
                                <Flame className="w-3 h-3" />
                                <span>{member.streakDays}d streak</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
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
                          className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors tabular-nums ${
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
                          className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors tabular-nums ${
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
            )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Explore & Community Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <MascotDisplay
            variant="medallion"
            size="md"
            floating
            alt="Actake Community Mascot"
          />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#F16A2E]">
              Explore Habits, Feeds &amp; Pools
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
              Explore &amp; Join Stakes
            </h1>
            <p className="text-sm text-[#6B6663] mt-0.5">
              Start fast from curated habit templates, cheer live proofs, or inspect pool standings.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setCreateOpen(true);
          }}
          className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center gap-2 self-start sm:self-auto whitespace-nowrap transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Create Community Pool</span>
        </button>
      </div>

      {/* Search Bar with Clear Action + Rearranged Tabs (Templates first -> Social Feed -> Pools last) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#877F7A] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates, members, or community pools..."
            aria-label="Search templates, members, or community pools"
            className="w-full min-h-[44px] pl-11 pr-10 rounded-full bg-white border border-[#EFE2D9] text-sm text-[#111114] placeholder:text-[#9A938E] shadow-[0_4px_14px_rgba(24,20,18,0.04)] focus:outline-none focus:border-[#F16A2E]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="w-8 h-8 rounded-full hover:bg-[#FFF4EE] flex items-center justify-center text-[#877F7A] hover:text-[#111114] absolute right-1.5 top-1/2 -translate-y-1/2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="inline-flex items-center p-1 rounded-full bg-white border border-[#EFE2D9] shadow-[0_4px_14px_rgba(24,20,18,0.04)] self-start overflow-x-auto max-w-full">
          {(
            [
              { id: 'templates', label: `Templates (${filteredPacks.length})` },
              { id: 'feed', label: 'Social Feed' },
              { id: 'community', label: `Pools (${filteredSquads.length})` },
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

      {/* SECTION 1 (FIRST TAB): TEMPLATES, RECOMMENDED & TRENDING HABITS */}
      {section === 'templates' &&
        (filteredPacks.length === 0 ? (
          <EmptyState
            icon={<Compass className="w-5 h-5" />}
            title="No Matching Habit Templates"
            description={`No starter templates match “${searchQuery}”. Clear the search box to browse all routines.`}
            ctaLabel="Clear Search"
            onCta={() => setSearchQuery('')}
          />
        ) : (
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
                    className="min-h-[42px] px-4 py-1.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    Stake &amp; Join
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* SECTION 2: COMMUNITY SOCIAL FEED */}
      {section === 'feed' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedSort('recent')}
              className={`min-h-[42px] px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                feedSort === 'recent'
                  ? 'bg-[#111114] border-[#111114] text-white'
                  : 'bg-white border-[#EFE2D9] text-[#6B6663] hover:text-[#111114]'
              }`}
            >
              Recent Proofs
            </button>
            <button
              type="button"
              onClick={() => setFeedSort('popular')}
              className={`min-h-[42px] px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                feedSort === 'popular'
                  ? 'bg-[#111114] border-[#111114] text-white'
                  : 'bg-white border-[#EFE2D9] text-[#6B6663] hover:text-[#111114]'
              }`}
            >
              Popular
            </button>
          </div>

          {allFeedEntries.length === 0 ? (
            <EmptyState
              icon={<Flame className="w-5 h-5" />}
              title="No Community Proofs Found"
              description={
                q
                  ? `No verified check-ins match “${searchQuery}”.`
                  : 'Check-ins from your squads will appear here as soon as members beat their alarms.'
              }
              ctaLabel={q ? 'Clear Search' : 'Browse Community Pools'}
              onCta={() => (q ? setSearchQuery('') : setSection('community'))}
            />
          ) : (
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

                  <div className="rounded-2xl bg-[#FFF8F4] border border-[#F4E6DD] p-3.5 text-xs text-[#111114]">
                    {item.status === 'missed'
                      ? `Missed deadline · -$${(item.slashedAmount ?? item.stakeAmount).toFixed(2)} ${item.token} slashed`
                      : `${item.itemVerified} · ${item.streak} day streak verified`}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenSquadLobby(item.squadId)}
                      className="min-h-[38px] text-xs font-bold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                    >
                      <span>View Pool Leaderboard</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>

                    {item.status === 'verified' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleReaction(item.squadId, item.id, 'like')}
                          className={`min-h-[38px] px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 tabular-nums ${
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
                          className={`min-h-[38px] px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 tabular-nums ${
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
          )}
        </div>
      )}

      {/* SECTION 3 (LAST TAB): SCALABLE COMMUNITY POOLS DIRECTORY — CLICK ANY POOL TO OPEN ITS DEDICATED SCREEN */}
      {section === 'community' &&
        (filteredSquads.length === 0 ? (
          <EmptyState
            showMascot
            title="No Matching Community Pools"
            description={
              q
                ? `No community pools match “${searchQuery}”. Clear your search or launch a custom pool.`
                : 'Launch your first accountability pool and invite friends with a single Solana Blink.'
            }
            ctaLabel={q ? 'Clear Search' : 'Create Community Pool'}
            onCta={() => (q ? setSearchQuery('') : setCreateOpen(true))}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSquads.map((sq) => {
              const sqMeta = resolvePoolMeta(sq);
              const verifiedCount = sqMeta.members.filter((m) => m.status === 'verified').length;
              const slashedCount = sqMeta.members.filter((m) => m.status === 'slashed').length;
              return (
                <button
                  key={sq.id}
                  type="button"
                  onClick={() => {
                    setOpenedPoolId(sq.id);
                    setLeaderboardFilter('all');
                    setPoolRightView('leaderboard');
                  }}
                  className="actake-card group text-left p-6 flex flex-col justify-between gap-4 hover:border-[#F16A2E]/65 hover:shadow-[0_14px_32px_rgba(241,106,46,0.1)] transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-[#F16A2E]">
                          {sqMeta.categoryLabel}
                        </div>
                        <h3 className="font-display text-lg font-extrabold text-[#111114] group-hover:text-[#F16A2E] transition-colors mt-0.5">
                          {sq.name}
                        </h3>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#16A34A] text-[11px] font-bold tabular-nums shrink-0">
                        {sq.checkedInPct}% on time
                      </span>
                    </div>

                    <p className="text-xs text-[#6B6663] leading-relaxed line-clamp-3">
                      {sqMeta.description}
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-1 tabular-nums">
                      <div className="rounded-xl bg-[#FFF8F4] border border-[#F2E3DA] px-3 py-2">
                        <div className="text-[10px] font-semibold text-[#877F7A]">
                          Pool Pot · Stake
                        </div>
                        <div className="text-xs font-extrabold text-[#111114] mt-0.5">
                          ${sq.totalPot} · ${sq.stakeAmount} {sq.token}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2">
                        <div className="text-[10px] font-semibold text-[#991B1B]">
                          Slashed Bonus
                        </div>
                        <div className="text-xs font-extrabold text-[#DC2626] mt-0.5">
                          +${sq.slashedPot} {sq.token}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-[#6B6663] tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#F16A2E]" />
                          <span>Daily {sq.alarmTimeLabel}</span>
                        </span>
                        <span>
                          {verifiedCount} verified · {slashedCount} slashed
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#F7ECE6] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#16A34A]"
                          style={{ width: `${sq.checkedInPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#F4ECE7] flex items-center justify-between gap-2 text-xs">
                    <span className="text-[#6B6663] font-medium tabular-nums inline-flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#877F7A]" />
                      <span>{sq.memberCount} members</span>
                    </span>
                    <span className="font-bold text-[#111114] group-hover:text-[#F16A2E] inline-flex items-center gap-1 transition-colors">
                      <span>View Leaderboard</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}

      {/* Create Community Pool Modal */}
      {createOpen && (
        <div
          onClick={() => setCreateOpen(false)}
          className="fixed inset-0 z-50 bg-[#111114]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-white p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-[#111114]">
                Launch Community Stake Pool
              </h3>
              <button
                type="button"
                aria-label="Close create pool modal"
                onClick={() => setCreateOpen(false)}
                className="w-11 h-11 rounded-full bg-[#FFF4EE] hover:bg-[#FFE5D6] flex items-center justify-center text-[#111114] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="pool-name-input"
                  className="block text-xs font-semibold text-[#111114] mb-1"
                >
                  Community Name
                </label>
                <input
                  id="pool-name-input"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => {
                    setCreateError(null);
                    setNewName(e.target.value);
                  }}
                  placeholder="e.g., 6AM Founders Sprint"
                  className="w-full min-h-[46px] rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-2.5 text-sm focus:outline-none focus:border-[#F16A2E]"
                />
              </div>

              <div>
                <label
                  htmlFor="pool-description-input"
                  className="block text-xs font-semibold text-[#111114] mb-1"
                >
                  What is this pool about?
                </label>
                <textarea
                  id="pool-description-input"
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe the daily routine, proof goal, and who should join..."
                  className="w-full rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-2.5 text-sm focus:outline-none focus:border-[#F16A2E] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="pool-time-input"
                    className="block text-xs font-semibold text-[#111114] mb-1"
                  >
                    Daily Cutoff Time
                  </label>
                  <input
                    id="pool-time-input"
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full min-h-[46px] rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F16A2E]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="pool-amount-input"
                    className="block text-xs font-semibold text-[#111114] mb-1"
                  >
                    Stake Per Member
                  </label>
                  <input
                    id="pool-amount-input"
                    type="number"
                    min={5}
                    max={500}
                    value={newAmount}
                    onChange={(e) => {
                      setCreateError(null);
                      setNewAmount(Number(e.target.value));
                    }}
                    className="w-full min-h-[46px] rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F16A2E]"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#111114] mb-1.5">Pool Token</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['USDC', 'SKR'] as TokenType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewToken(t)}
                      className={`min-h-[44px] rounded-full text-xs font-bold transition-colors ${
                        newToken === t
                          ? 'bg-[#111114] text-white'
                          : 'bg-[#FFF4EE] text-[#111114] hover:bg-[#FFE5D6]'
                      }`}
                    >
                      {t === 'SKR' ? 'SKR (0% Fee)' : 'USDC (SPL)'}
                    </button>
                  ))}
                </div>
              </div>

              {createError && (
                <div
                  role="alert"
                  className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#991B1B] flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-full text-sm font-medium text-[#6B6663] hover:bg-[#FFF4EE]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#F16A2E] text-white text-sm font-bold hover:bg-[#DC5A20]"
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
