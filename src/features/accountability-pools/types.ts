import type { TokenType } from '../../types/actake';

/**
 * 0 = Physical Steps, 1 = Gym Attendance, 2 = Study Focus
 */
export type AccountabilityTrackCategory = 0 | 1 | 2;

export interface AccountabilityTrackMeta {
  category: AccountabilityTrackCategory;
  slug: 'steps' | 'gym' | 'study';
  label: string;
  shortLabel: string;
  unit: string;
  unitShort: string;
  defaultTarget: number;
  minTarget: number;
  maxTarget: number;
  stepIncrement: number;
  description: string;
  proofMethodLabel: string;
}

export const ACCOUNTABILITY_TRACKS: Record<AccountabilityTrackCategory, AccountabilityTrackMeta> = {
  0: {
    category: 0,
    slug: 'steps',
    label: 'Physical Steps',
    shortLabel: 'Steps',
    unit: 'steps / day',
    unitShort: 'steps',
    defaultTarget: 8000,
    minTarget: 1000,
    maxTarget: 50000,
    stepIncrement: 500,
    description: 'Hardware pedometer delta verified via Capacitor StepCounterBridge & SHA-256 proof.',
    proofMethodLabel: 'Hardware Step Counter (Android APK)',
  },
  1: {
    category: 1,
    slug: 'gym',
    label: 'Gym Attendance',
    shortLabel: 'Gym',
    unit: 'mins inside 150m gym zone',
    unitShort: 'mins',
    defaultTarget: 45,
    minTarget: 10,
    maxTarget: 240,
    stepIncrement: 5,
    description: 'Live geolocation dwell samples inside a 150m radius of your chosen gym.',
    proofMethodLabel: '150m Geofence Dwell Samples',
  },
  2: {
    category: 2,
    slug: 'study',
    label: 'Deep Study',
    shortLabel: 'Study',
    unit: 'uninterrupted focus mins',
    unitShort: 'mins',
    defaultTarget: 60,
    minTarget: 10,
    maxTarget: 360,
    stepIncrement: 10,
    description: 'Web Worker focus timer with tab-visibility integrity heartbeats hashed on completion.',
    proofMethodLabel: 'Web Worker Focus Heartbeats',
  },
};

export interface StepStakeCheckinReceipt {
  id: string;
  poolId: string;
  userPubkey: string;
  displayName: string;
  dayIndex: number;
  metricAchieved: number;
  proofHash: string;
  txSignature: string;
  onchainMode: 'anchor-cpi' | 'devnet-spl-memo';
  verifiedAt: string;
  signedBySessionDelegate?: boolean;
}

export type StepStakeVisibility = 'solo' | 'community';

export type StepStakePayoutStatus =
  | 'disbursed'
  | 'claim_verified_escrow_unconfigured'
  | 'escrow_insufficient_funds';

export interface StepStakeDailyClaimReceipt {
  dayIndex: number;
  principalAmount: number;
  bonusAmount: number;
  totalPayout: number;
  claimTxSignature: string;
  claimSolscanUrl: string;
  payoutTxSignature?: string | null;
  payoutSolscanUrl?: string | null;
  payoutStatus: StepStakePayoutStatus;
  payoutDetail?: string;
  claimedAt: string;
}

export interface StepStakeParticipant {
  walletPubkey: string;
  displayName: string;
  initials: string;
  daysCompleted: number;
  lastCheckinDay: number;
  isEliminated: boolean;
  hasClaimed: boolean;
  latestProofHash: string | null;
  stakeTxSignature: string;
  slashTxSignature?: string | null;
  claimTxSignature?: string | null;
  payoutTxSignature?: string | null;
  payoutStatus?: StepStakePayoutStatus | null;
  claimedPayout?: number | null;
  claimedPrincipalTotal?: number;
  claimedDays?: StepStakeDailyClaimReceipt[];
  sessionDelegatePubkey?: string | null;
  joinedAt: string;
}

export interface StepStakePool {
  id: string;
  poolNumericId: number;
  poolPda: string;
  vaultPda: string;
  title: string;
  visibility: StepStakeVisibility;
  creatorPubkey: string;
  category: AccountabilityTrackCategory;
  tokenSymbol: TokenType;
  mint: string;
  stakeAmount: number;
  dailyPrincipal: number;
  targetMetric: number;
  durationDays: number;
  startTimestampSec: number;
  skrMultiplierBps: number;
  /** Optional Gym target coordinates for category === 1 */
  gymLocationName?: string | null;
  gymLat?: number | null;
  gymLng?: number | null;
  gymRadiusMeters?: number;
  totalParticipants: number;
  activeParticipants: number;
  forfeitedVaultBalance: number;
  createTxSignature: string;
  onchainMode: 'anchor-cpi' | 'devnet-spl-memo';
  participants: StepStakeParticipant[];
  checkins: StepStakeCheckinReceipt[];
  createdAt: string;
}

export interface CreateStepStakePoolInput {
  title: string;
  visibility?: StepStakeVisibility;
  creatorPubkey: string;
  category: AccountabilityTrackCategory;
  tokenSymbol: TokenType;
  stakeAmount: number;
  targetMetric: number;
  durationDays: number;
  skrMultiplierBps: number;
  gymLocationName?: string | null;
  gymLat?: number | null;
  gymLng?: number | null;
  poolNumericId: number;
  poolPda: string;
  vaultPda: string;
  createTxSignature: string;
  onchainMode: 'anchor-cpi' | 'devnet-spl-memo';
}

export interface TrackProofPayload {
  track: 'steps' | 'gym' | 'study';
  metricAchieved: number;
  proofHash: string;
  canonicalJson: string;
  sampleCount: number;
  collectedAtIso: string;
}
