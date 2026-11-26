import {
  AlarmSettings,
  GeoHuntZone,
  HabitCategory,
  HistoryEntry,
  SquadPool,
  StakeCommitment,
} from '../types/actake';
import { buildSquadBlinkUrl } from '../solana/actakeEscrow';

export const BUILTIN_CATEGORIES: HabitCategory[] = [
  {
    id: 'morning_wakeup',
    name: 'Morning Wakeup',
    subtitle: 'Random morning item (mug, sink, window, slippers…)',
    environmentHint:
      'Relatable everyday morning items like a coffee mug, glass of water, bathroom sink, towel, opened curtains, slippers, hairbrush, keys, or breakfast bowl',
    iconKey: 'toothbrush',
  },
  {
    id: 'gym_fitness',
    name: 'Gym & Fitness',
    subtitle: 'Random workout move or gym gear (push-ups, squats, shoes…)',
    environmentHint:
      'Gym equipment, dumbbells, running shoes, workout water bottle, yoga mat, gym bag, or live bodyweight moves like push-ups, squats, or plank',
    iconKey: 'dumbbell',
  },
  {
    id: 'make_bed',
    name: 'Photo of Bed',
    subtitle: 'Neatly made bed pillows & folded blanket',
    environmentHint: 'Bedroom with neatly arranged bed pillows and straightened duvet',
    iconKey: 'bed',
  },
  {
    id: 'reading_study',
    name: 'Study Session',
    subtitle: 'Physical book, notebook, or desk lamp',
    environmentHint: 'Study desk with open physical book, notebook, or pen',
    iconKey: 'book',
  },
  {
    id: 'outdoors_grass',
    name: 'Touch Grass',
    subtitle: 'Outdoor greenery, foliage, or walking gear',
    environmentHint: 'Outdoor green grass, tree leaves, sunlit sidewalk, or keys',
    iconKey: 'grass',
  },
  {
    id: 'hydration_kitchen',
    name: 'Hydration & Kitchen',
    subtitle: 'Water bottle, ceramic mug, or kitchen utensil',
    environmentHint: 'Kitchen counter with water glass, bottle, coffee mug, or spoon',
    iconKey: 'kitchen',
  },
  {
    id: 'push_ups',
    name: 'Push-Ups Set',
    subtitle: 'Floor plank or workout mat live proof',
    environmentHint: 'Exercise mat, athletic floor space, or workout gear in clear room lighting',
    iconKey: 'dumbbell',
  },
  {
    id: 'squats',
    name: 'Morning Squats',
    subtitle: 'Active stance or training shoes live proof',
    environmentHint: 'Open workout floor area, running sneakers, or home fitness space',
    iconKey: 'dumbbell',
  },
];

export const DEFAULT_GEO_HUNTS: GeoHuntZone[] = [
  {
    id: 'hunt-stadium-run',
    title: '6:30 AM Stadium Run',
    category: 'Running',
    alarmTimeLabel: '06:30 AM',
    poolUsd: 250,
    targetLatOffset: 0.0009,
    targetLngOffset: 0.0007,
    radiusMeters: 150,
    participantCount: 42,
    targetItemHint: 'Running Shoe or Sneaker',
  },
  {
    id: 'hunt-campus-quad',
    title: '7:00 AM Campus Dawn Loop',
    category: 'Campus Hunt',
    alarmTimeLabel: '07:00 AM',
    poolUsd: 185,
    targetLatOffset: -0.0006,
    targetLngOffset: 0.0008,
    radiusMeters: 140,
    participantCount: 28,
    targetItemHint: 'Water Bottle',
  },
  {
    id: 'hunt-iron-club',
    title: '6:00 AM Iron Club Check-in',
    category: 'Gym Check-in',
    alarmTimeLabel: '06:00 AM',
    poolUsd: 320,
    targetLatOffset: 0.0005,
    targetLngOffset: -0.0009,
    radiusMeters: 120,
    participantCount: 54,
    targetItemHint: 'Dumbbell or Water Jug',
  },
];

export interface PersistedUserData {
  stakes: StakeCommitment[];
  customCategories: HabitCategory[];
  recentVerifiedItems: string[];
  history: HistoryEntry[];
  squads: SquadPool[];
  alarmSettings: AlarmSettings;
  streakDays: number;
  actPoints: number;
  earnedUsdcBalance: number;
  earnedSkrBalance: number;
}

function getStorageKey(publicKey: string): string {
  return `actake_store_v1_${publicKey}`;
}

export function createSeedUserData(publicKey: string): PersistedUserData {
  const shortKey = publicKey.slice(0, 8);
  return {
    stakes: [
      {
        id: 'stake-seed-morning',
        categoryId: 'morning_wakeup',
        categoryName: 'Morning Wakeup',
        environmentHint:
          'Relatable everyday morning items like a coffee mug, glass of water, bathroom sink, towel, opened curtains, slippers, hairbrush, keys, or breakfast bowl',
        amount: 15,
        token: 'USDC',
        protocolFeePct: 1.5,
        alarmHour: 6,
        alarmMinute: 0,
        alarmSound: 'siren',
        escrowPda: `ACTK${shortKey}9xWakePoolEscrowPDA7k2m`,
        joinTxSignature: `5vActkJoin${shortKey}99xDevnetEscrowSig4m2`,
        recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
        createdAt: Date.now() - 3 * 60 * 60 * 1000,
        status: 'locked',
        squadName: '7AM Campus Wake Club',
        slashedBonusEstimate: 3.4,
      },
      {
        id: 'stake-seed-gym',
        categoryId: 'gym_fitness',
        categoryName: 'Gym & Fitness',
        environmentHint:
          'Gym equipment, dumbbells, running shoes, workout water bottle, yoga mat, gym bag, or live bodyweight moves like push-ups, squats, or plank',
        amount: 25,
        token: 'SKR',
        protocolFeePct: 0,
        alarmHour: 7,
        alarmMinute: 30,
        alarmSound: 'mayhem',
        escrowPda: `ACTK${shortKey}4zGymPoolEscrowPDA3q9n`,
        joinTxSignature: `3kActkJoin${shortKey}88yToken2022SkrSig9p1`,
        recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
        createdAt: Date.now() - 1 * 60 * 60 * 1000,
        status: 'locked',
        slashedBonusEstimate: 4.8,
      },
    ],
    customCategories: [],
    recentVerifiedItems: ['Coffee Mug', 'Keys or Keychain'],
    history: [
      {
        id: 'hist-1',
        dateIso: new Date(Date.now() - 86_400_000).toISOString(),
        habitTitle: 'Morning Wakeup',
        verifiedItem: 'Toothbrush',
        token: 'USDC',
        principal: 15,
        bonus: 3.4,
        totalPayout: 18.4,
        txSignature: '4xClaimPayoutDevnetSig8a9c11k7mN2pQ',
        status: 'claimed',
      },
      {
        id: 'hist-2',
        dateIso: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        habitTitle: 'Gym & Fitness',
        verifiedItem: 'Dumbbell or Water Jug',
        token: 'SKR',
        principal: 20,
        bonus: 5.2,
        totalPayout: 25.2,
        txSignature: '2yClaimSkrZeroFeeSig5b8f22r9tV4xW',
        status: 'claimed',
      },
      {
        id: 'hist-3',
        dateIso: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        habitTitle: 'Study Session',
        verifiedItem: 'Open Book or Notebook',
        token: 'USDC',
        principal: 10,
        bonus: 2.1,
        totalPayout: 12.1,
        txSignature: '6zClaimStudyPoolSig9c4d11m2nK8vJ',
        status: 'claimed',
      },
    ],
    squads: [
      {
        id: 'squad-7am-club',
        name: '7AM Campus Wake Club',
        alarmTimeLabel: '07:00 AM',
        stakeAmount: 10,
        token: 'USDC',
        memberCount: 45,
        checkedInPct: 78,
        totalPot: 185,
        slashedPot: 30,
        blinkUrl: buildSquadBlinkUrl({
          poolId: 'squad-7am-club',
          squadName: '7AM Campus Wake Club',
          amount: 10,
          token: 'USDC',
          alarmTime: '07:00 AM',
        }),
        feed: [
          {
            id: 'feed-alex',
            memberName: 'Alex',
            initials: 'AL',
            timeLabel: '05:58 AM',
            streak: 14,
            itemVerified: 'Toothbrush Scanned',
            status: 'verified',
            likes: 8,
            fires: 5,
          },
          {
            id: 'feed-sarah',
            memberName: 'Sarah',
            initials: 'SA',
            timeLabel: '06:12 AM',
            streak: 32,
            itemVerified: 'Gym Dumbbell',
            status: 'verified',
            likes: 11,
            fires: 7,
          },
          {
            id: 'feed-marcus',
            memberName: 'Marcus',
            initials: 'MA',
            timeLabel: 'Missed deadline',
            streak: 0,
            itemVerified: 'No Photo Submitted',
            status: 'missed',
            slashedAmount: 10,
            likes: 0,
            fires: 0,
          },
        ],
      },
      {
        id: 'squad-skr-builders',
        name: 'Solana Builders 6AM SKR',
        alarmTimeLabel: '06:00 AM',
        stakeAmount: 25,
        token: 'SKR',
        memberCount: 19,
        checkedInPct: 89,
        totalPot: 475,
        slashedPot: 50,
        blinkUrl: buildSquadBlinkUrl({
          poolId: 'squad-skr-builders',
          squadName: 'Solana Builders 6AM SKR',
          amount: 25,
          token: 'SKR',
          alarmTime: '06:00 AM',
        }),
        feed: [
          {
            id: 'feed-nina',
            memberName: 'Nina',
            initials: 'NI',
            timeLabel: '05:54 AM',
            streak: 21,
            itemVerified: 'Coffee Mug Verified',
            status: 'verified',
            likes: 6,
            fires: 9,
          },
        ],
      },
    ],
    alarmSettings: {
      selectedSound: 'siren',
      strictMode: true,
      volume: 0.85,
    },
    streakDays: 43,
    actPoints: 1840,
    earnedUsdcBalance: 142.5,
    earnedSkrBalance: 65.0,
  };
}

export function loadUserData(publicKey: string): PersistedUserData {
  try {
    const raw = localStorage.getItem(getStorageKey(publicKey));
    if (raw) {
      return JSON.parse(raw) as PersistedUserData;
    }
  } catch {
    // fallback to seed
  }
  const seed = createSeedUserData(publicKey);
  saveUserData(publicKey, seed);
  return seed;
}

export function saveUserData(publicKey: string, data: PersistedUserData): void {
  try {
    localStorage.setItem(getStorageKey(publicKey), JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}
