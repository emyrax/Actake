import crypto from 'crypto';
import type {
  AccountabilityTrackCategory,
  CreateStepStakePoolInput,
  StepStakeCheckinReceipt,
  StepStakeDailyClaimReceipt,
  StepStakeParticipant,
  StepStakePayoutStatus,
  StepStakePool,
  StepStakeVisibility,
} from '../features/accountability-pools/types.ts';
import { calculateDailyPayoutBreakdown } from '../utils/stakePayouts.ts';

const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const SKR_DEVNET_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';

const memoryStepStakePools = new Map<string, StepStakePool>();

function shortenPk(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 4)}...${pk.slice(-4)}` : pk;
}

function makeInitials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (cleaned.slice(0, 2) || 'AC').toUpperCase();
}

function seedStarterStepStakePools(): void {
  if (memoryStepStakePools.size > 0) return;

  const nowSec = Math.floor(Date.now() / 1000);
  // Start pools 2 days ago so Day 1-2 have realistic check-ins, and 1 quitter is eligible for permissionless slash crank!
  const twoDaysAgoSec = nowSec - 2 * 86_400;
  const oneDayAgoSec = nowSec - 86_400;
  const completedPoolStartSec = nowSec - 8 * 86_400;

  const starterPools: StepStakePool[] = [
    {
      id: 'step-stake-seeker-10k',
      poolNumericId: 1001,
      poolPda: 'StpPda7xSeeker10kChallenge1111111111111111',
      vaultPda: 'StpVlt7xSeeker10kVault11111111111111111111',
      title: 'Seeker 8,000 Steps Sprint',
      visibility: 'community',
      creatorPubkey: '7xSeekerSteps11111111111111111111111111111',
      category: 0,
      tokenSymbol: 'SKR',
      mint: SKR_DEVNET_MINT,
      stakeAmount: 20,
      dailyPrincipal: calculateDailyPayoutBreakdown({ totalStake: 20, totalDays: 7, token: 'SKR', visibility: 'community' }).baseDailyPrincipal,
      targetMetric: 8000,
      durationDays: 7,
      startTimestampSec: twoDaysAgoSec,
      skrMultiplierBps: 12000,
      totalParticipants: 4,
      activeParticipants: 3,
      forfeitedVaultBalance: 20,
      createTxSignature: '5xStepPoolCreateSeeker8kDevnetDemo1111111111111111111111111111111111111',
      onchainMode: 'devnet-spl-memo',
      participants: [
        {
          walletPubkey: '7xSeekerSteps11111111111111111111111111111',
          displayName: 'Tobi (Seeker)',
          initials: 'TS',
          daysCompleted: 2,
          lastCheckinDay: 2,
          isEliminated: false,
          hasClaimed: false,
          latestProofHash:
            '9d4f7b2a1c8e3f0561a9e74b2c1d8f3e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d',
          stakeTxSignature: '4kStakeTobiStepsDevnet1111111111111111111111111111111111111111111111',
          joinedAt: new Date(twoDaysAgoSec * 1000).toISOString(),
        },
        {
          walletPubkey: '4mSolanaWalker2222222222222222222222222222',
          displayName: 'Maya',
          initials: 'MA',
          daysCompleted: 2,
          lastCheckinDay: 2,
          isEliminated: false,
          hasClaimed: false,
          latestProofHash:
            '3a8c5e1f9b7d2a4c6e8f0a1b3c5d7e9f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
          stakeTxSignature: '3jStakeMayaStepsDevnet2222222222222222222222222222222222222222222222',
          joinedAt: new Date((twoDaysAgoSec + 1200) * 1000).toISOString(),
        },
        {
          walletPubkey: '9qMissedRunner3333333333333333333333333333',
          displayName: 'Devon (Overdue)',
          initials: 'DE',
          daysCompleted: 1,
          lastCheckinDay: 1,
          isEliminated: false,
          hasClaimed: false,
          latestProofHash:
            '1f2e3d4c5b6a79887766554433221100ffeeddccbbaa99887766554433221100',
          stakeTxSignature: '2hStakeDevonStepsDevnet333333333333333333333333333333333333333333333',
          joinedAt: new Date((twoDaysAgoSec + 2400) * 1000).toISOString(),
        },
        {
          walletPubkey: '6pQuitterFour44444444444444444444444444444',
          displayName: 'Kofi',
          initials: 'KO',
          daysCompleted: 0,
          lastCheckinDay: 0,
          isEliminated: true,
          hasClaimed: false,
          latestProofHash: null,
          stakeTxSignature: '2gStakeKofiStepsDevnet4444444444444444444444444444444444444444444444',
          slashTxSignature: '4vSlashKofiDay1Devnet4444444444444444444444444444444444444444444444',
          joinedAt: new Date((twoDaysAgoSec + 3600) * 1000).toISOString(),
        },
      ],
      checkins: [
        {
          id: 'chk-steps-1',
          poolId: 'step-stake-seeker-10k',
          userPubkey: '7xSeekerSteps11111111111111111111111111111',
          displayName: 'Tobi (Seeker)',
          dayIndex: 2,
          metricAchieved: 9420,
          proofHash: '9d4f7b2a1c8e3f0561a9e74b2c1d8f3e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d',
          txSignature: '5cCheckinTobiDay2Devnet11111111111111111111111111111111111111111111',
          onchainMode: 'devnet-spl-memo',
          verifiedAt: new Date((nowSec - 14_400) * 1000).toISOString(),
        },
        {
          id: 'chk-steps-2',
          poolId: 'step-stake-seeker-10k',
          userPubkey: '4mSolanaWalker2222222222222222222222222222',
          displayName: 'Maya',
          dayIndex: 2,
          metricAchieved: 8615,
          proofHash: '3a8c5e1f9b7d2a4c6e8f0a1b3c5d7e9f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
          txSignature: '4bCheckinMayaDay2Devnet22222222222222222222222222222222222222222222',
          onchainMode: 'devnet-spl-memo',
          verifiedAt: new Date((nowSec - 21_600) * 1000).toISOString(),
        },
      ],
      createdAt: new Date(twoDaysAgoSec * 1000).toISOString(),
    },
    {
      id: 'step-stake-iron-gym-45',
      poolNumericId: 1002,
      poolPda: 'GymPda8xIronFoundry45Min111111111111111111',
      vaultPda: 'GymVlt8xIronFoundryVault111111111111111111',
      title: '45-Min Iron Gym Club',
      visibility: 'community',
      creatorPubkey: '8vGymCaptain555555555555555555555555555555',
      category: 1,
      tokenSymbol: 'USDC',
      mint: USDC_DEVNET_MINT,
      stakeAmount: 25,
      dailyPrincipal: calculateDailyPayoutBreakdown({ totalStake: 25, totalDays: 7, token: 'USDC', visibility: 'community' }).baseDailyPrincipal,
      targetMetric: 45,
      durationDays: 7,
      startTimestampSec: oneDayAgoSec,
      skrMultiplierBps: 10000,
      gymLocationName: 'Foundry Athletics Club',
      gymLat: 37.7897,
      gymLng: -122.4014,
      gymRadiusMeters: 150,
      totalParticipants: 3,
      activeParticipants: 2,
      forfeitedVaultBalance: 25,
      createTxSignature: '5yGymPoolCreateFoundry45DevnetDemo222222222222222222222222222222222222',
      onchainMode: 'devnet-spl-memo',
      participants: [
        {
          walletPubkey: '8vGymCaptain555555555555555555555555555555',
          displayName: 'Sarah',
          initials: 'SA',
          daysCompleted: 1,
          lastCheckinDay: 1,
          isEliminated: false,
          hasClaimed: false,
          latestProofHash:
            '7e6d5c4b3a29182736455463728190a1b2c3d4e5f60718293a4b5c6d7e8f9012',
          stakeTxSignature: '3rStakeSarahGymDevnet5555555555555555555555555555555555555555555555',
          joinedAt: new Date(oneDayAgoSec * 1000).toISOString(),
        },
        {
          walletPubkey: '5nLifterSix6666666666666666666666666666666',
          displayName: 'Nikhil',
          initials: 'NI',
          daysCompleted: 1,
          lastCheckinDay: 1,
          isEliminated: false,
          hasClaimed: false,
          latestProofHash:
            '8f7e6d5c4b3a29182736455463728190abcdef1234567890fedcba0987654321',
          stakeTxSignature: '3sStakeNikhilGymDevnet666666666666666666666666666666666666666666666',
          joinedAt: new Date((oneDayAgoSec + 1800) * 1000).toISOString(),
        },
        {
          walletPubkey: '3wSkippedLegDay777777777777777777777777777',
          displayName: 'Liam',
          initials: 'LI',
          daysCompleted: 0,
          lastCheckinDay: 0,
          isEliminated: true,
          hasClaimed: false,
          latestProofHash: null,
          stakeTxSignature: '3tStakeLiamGymDevnet77777777777777777777777777777777777777777777777',
          slashTxSignature: '4wSlashLiamDay1Devnet7777777777777777777777777777777777777777777777',
          joinedAt: new Date((oneDayAgoSec + 3600) * 1000).toISOString(),
        },
      ],
      checkins: [
        {
          id: 'chk-gym-1',
          poolId: 'step-stake-iron-gym-45',
          userPubkey: '8vGymCaptain555555555555555555555555555555',
          displayName: 'Sarah',
          dayIndex: 1,
          metricAchieved: 52,
          proofHash: '7e6d5c4b3a29182736455463728190a1b2c3d4e5f60718293a4b5c6d7e8f9012',
          txSignature: '5dCheckinSarahGymDay1Devnet5555555555555555555555555555555555555555',
          onchainMode: 'devnet-spl-memo',
          verifiedAt: new Date((nowSec - 18_000) * 1000).toISOString(),
        },
      ],
      createdAt: new Date(oneDayAgoSec * 1000).toISOString(),
    },
    {
      id: 'step-stake-deep-study-90',
      poolNumericId: 1003,
      poolPda: 'StdPda9xDeepStudySprint1111111111111111111',
      vaultPda: 'StdVlt9xDeepStudyVault11111111111111111111',
      title: 'Builders Deep Study 60m',
      visibility: 'community',
      creatorPubkey: '9zStudyBuilder8888888888888888888888888888',
      category: 2,
      tokenSymbol: 'SKR',
      mint: SKR_DEVNET_MINT,
      stakeAmount: 15,
      dailyPrincipal: calculateDailyPayoutBreakdown({ totalStake: 15, totalDays: 7, token: 'SKR', visibility: 'community' }).baseDailyPrincipal,
      targetMetric: 60,
      durationDays: 7,
      startTimestampSec: completedPoolStartSec,
      skrMultiplierBps: 12000,
      totalParticipants: 3,
      activeParticipants: 2,
      forfeitedVaultBalance: 15,
      createTxSignature: '5zStudyPoolCreateDeep60DevnetDemo333333333333333333333333333333333333',
      onchainMode: 'devnet-spl-memo',
      participants: [
        {
          walletPubkey: '9zStudyBuilder8888888888888888888888888888',
          displayName: 'Elena',
          initials: 'EL',
          daysCompleted: 7,
          lastCheckinDay: 7,
          isEliminated: false,
          hasClaimed: false,
          latestProofHash:
            '2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c',
          stakeTxSignature: '3uStakeElenaStudyDevnet88888888888888888888888888888888888888888888',
          joinedAt: new Date(completedPoolStartSec * 1000).toISOString(),
        },
        {
          walletPubkey: '2kRustScholar99999999999999999999999999999',
          displayName: 'Chidi',
          initials: 'CH',
          daysCompleted: 7,
          lastCheckinDay: 7,
          isEliminated: false,
          hasClaimed: false,
          latestProofHash:
            '4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d',
          stakeTxSignature: '3vStakeChidiStudyDevnet99999999999999999999999999999999999999999999',
          joinedAt: new Date((completedPoolStartSec + 600) * 1000).toISOString(),
        },
        {
          walletPubkey: '1mTabSwitcher00000000000000000000000000000',
          displayName: 'Alex',
          initials: 'AL',
          daysCompleted: 2,
          lastCheckinDay: 2,
          isEliminated: true,
          hasClaimed: false,
          latestProofHash: null,
          stakeTxSignature: '3wStakeAlexStudyDevnet000000000000000000000000000000000000000000000',
          slashTxSignature: '4xSlashAlexDay3Devnet0000000000000000000000000000000000000000000000',
          joinedAt: new Date((completedPoolStartSec + 1200) * 1000).toISOString(),
        },
      ],
      checkins: [
        {
          id: 'chk-study-1',
          poolId: 'step-stake-deep-study-90',
          userPubkey: '9zStudyBuilder8888888888888888888888888888',
          displayName: 'Elena',
          dayIndex: 7,
          metricAchieved: 68,
          proofHash: '2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c',
          txSignature: '5eCheckinElenaStudyDay7Devnet88888888888888888888888888888888888888',
          onchainMode: 'devnet-spl-memo',
          verifiedAt: new Date((nowSec - 43_200) * 1000).toISOString(),
        },
      ],
      createdAt: new Date(completedPoolStartSec * 1000).toISOString(),
    },
  ];

  for (const pool of starterPools) {
    memoryStepStakePools.set(pool.id, pool);
  }
}

export function listStepStakePools(options?: {
  category?: AccountabilityTrackCategory;
  viewerPubkey?: string | null;
  visibility?: 'all' | StepStakeVisibility;
}): StepStakePool[] {
  seedStarterStepStakePools();
  const viewer = (options?.viewerPubkey || '').trim();
  const visFilter = options?.visibility || 'all';
  const all = Array.from(memoryStepStakePools.values()).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
  return all.filter((p) => {
    // Enforce strict Solo privacy: private solo pools are ONLY visible to their creator
    if (p.visibility === 'solo') {
      if (!viewer || p.creatorPubkey !== viewer) return false;
    }
    if (visFilter !== 'all' && p.visibility !== visFilter) return false;
    if (
      options?.category === 0 ||
      options?.category === 1 ||
      options?.category === 2
    ) {
      return p.category === options.category;
    }
    return true;
  });
}

export function getStepStakePoolById(poolId: string): StepStakePool | null {
  seedStarterStepStakePools();
  return memoryStepStakePools.get(poolId) || null;
}

export function createStepStakePoolRecord(
  input: CreateStepStakePoolInput & {
    creatorDisplayName?: string;
    autoJoinCreator?: boolean;
    creatorSessionDelegate?: string | null;
  }
): StepStakePool {
  seedStarterStepStakePools();
  const id = `step-stake-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const nowSec = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();
  const mint = input.tokenSymbol === 'SKR' ? SKR_DEVNET_MINT : USDC_DEVNET_MINT;
  const displayName = (input.creatorDisplayName || '').trim() || shortenPk(input.creatorPubkey);
  const visibility: StepStakeVisibility = input.visibility === 'community' ? 'community' : 'solo';
  const durationDays = Math.max(1, Math.min(365, Math.round(input.durationDays)));
  const stakeAmount = Number(input.stakeAmount.toFixed(2));
  const dailyBreakdown = calculateDailyPayoutBreakdown({
    totalStake: stakeAmount,
    totalDays: durationDays,
    token: input.tokenSymbol,
    visibility,
  });

  const initialParticipants: StepStakeParticipant[] = input.autoJoinCreator
    ? [
        {
          walletPubkey: input.creatorPubkey,
          displayName,
          initials: makeInitials(displayName),
          daysCompleted: 0,
          lastCheckinDay: 0,
          isEliminated: false,
          hasClaimed: false,
          latestProofHash: null,
          stakeTxSignature: input.createTxSignature,
          claimedPrincipalTotal: 0,
          claimedDays: [],
          sessionDelegatePubkey: input.creatorSessionDelegate || null,
          joinedAt: nowIso,
        },
      ]
    : [];

  const pool: StepStakePool = {
    id,
    poolNumericId: input.poolNumericId,
    poolPda: input.poolPda,
    vaultPda: input.vaultPda,
    title: input.title.trim(),
    visibility,
    creatorPubkey: input.creatorPubkey,
    category: input.category,
    tokenSymbol: input.tokenSymbol,
    mint,
    stakeAmount,
    dailyPrincipal: dailyBreakdown.baseDailyPrincipal,
    targetMetric: Math.round(input.targetMetric),
    durationDays,
    startTimestampSec: nowSec,
    skrMultiplierBps: input.skrMultiplierBps,
    gymLocationName: input.gymLocationName?.trim() || null,
    gymLat: typeof input.gymLat === 'number' && Number.isFinite(input.gymLat) ? input.gymLat : null,
    gymLng: typeof input.gymLng === 'number' && Number.isFinite(input.gymLng) ? input.gymLng : null,
    gymRadiusMeters: input.category === 1 ? 150 : undefined,
    totalParticipants: initialParticipants.length,
    activeParticipants: initialParticipants.length,
    forfeitedVaultBalance: 0,
    createTxSignature: input.createTxSignature,
    onchainMode: input.onchainMode,
    participants: initialParticipants,
    checkins: [],
    createdAt: nowIso,
  };

  memoryStepStakePools.set(pool.id, pool);
  return pool;
}

export function joinStepStakePoolRecord(params: {
  poolId: string;
  walletPubkey: string;
  displayName?: string;
  stakeTxSignature: string;
  sessionDelegatePubkey?: string | null;
}): StepStakePool | null {
  const pool = getStepStakePoolById(params.poolId);
  if (!pool) return null;

  if (pool.visibility === 'solo' && params.walletPubkey !== pool.creatorPubkey) {
    throw new Error('This is a private Solo Track Pool. Only the creator can participate.');
  }

  const existing = pool.participants.find((p) => p.walletPubkey === params.walletPubkey);
  if (existing) {
    if (params.sessionDelegatePubkey) {
      existing.sessionDelegatePubkey = params.sessionDelegatePubkey;
    }
    return pool;
  }

  const label = (params.displayName || '').trim() || shortenPk(params.walletPubkey);
  const participant: StepStakeParticipant = {
    walletPubkey: params.walletPubkey,
    displayName: label,
    initials: makeInitials(label),
    daysCompleted: 0,
    lastCheckinDay: 0,
    isEliminated: false,
    hasClaimed: false,
    latestProofHash: null,
    stakeTxSignature: params.stakeTxSignature,
    claimedPrincipalTotal: 0,
    claimedDays: [],
    sessionDelegatePubkey: params.sessionDelegatePubkey || null,
    joinedAt: new Date().toISOString(),
  };

  pool.participants.push(participant);
  pool.totalParticipants += 1;
  pool.activeParticipants += 1;
  return pool;
}

export function recordStepStakeDailyCheckin(params: {
  poolId: string;
  walletPubkey: string;
  dayIndex: number;
  metricAchieved: number;
  proofHash: string;
  txSignature: string;
  onchainMode: 'anchor-cpi' | 'devnet-spl-memo';
  signedBySessionDelegate?: boolean;
}): { pool: StepStakePool; receipt: StepStakeCheckinReceipt } {
  const pool = getStepStakePoolById(params.poolId);
  if (!pool) {
    throw new Error('Accountability pool not found.');
  }
  const participant = pool.participants.find((p) => p.walletPubkey === params.walletPubkey);
  if (!participant) {
    throw new Error('Join and stake in this pool before submitting daily proofs.');
  }
  if (participant.isEliminated) {
    throw new Error('Eliminated participants cannot submit further check-ins.');
  }
  if (params.dayIndex < 1 || params.dayIndex > pool.durationDays) {
    throw new Error(`Day index must be between 1 and ${pool.durationDays}.`);
  }
  if (participant.lastCheckinDay !== params.dayIndex - 1) {
    throw new Error(
      `Expected sequential Day ${participant.lastCheckinDay + 1} check-in (received Day ${params.dayIndex}).`
    );
  }
  if (params.metricAchieved < pool.targetMetric) {
    throw new Error(
      `Achieved metric (${params.metricAchieved}) is below required target (${pool.targetMetric}).`
    );
  }

  participant.daysCompleted += 1;
  participant.lastCheckinDay = params.dayIndex;
  participant.latestProofHash = params.proofHash;

  const receipt: StepStakeCheckinReceipt = {
    id: `ss-chk-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    poolId: pool.id,
    userPubkey: participant.walletPubkey,
    displayName: participant.displayName,
    dayIndex: params.dayIndex,
    metricAchieved: Math.round(params.metricAchieved),
    proofHash: params.proofHash,
    txSignature: params.txSignature,
    onchainMode: params.onchainMode,
    verifiedAt: new Date().toISOString(),
    signedBySessionDelegate: Boolean(params.signedBySessionDelegate),
  };

  pool.checkins.unshift(receipt);
  return { pool, receipt };
}

export function markStepStakeQuitterSlashed(params: {
  poolId: string;
  targetWalletPubkey: string;
  dayIndex: number;
  slashTxSignature: string;
}): StepStakePool {
  const pool = getStepStakePoolById(params.poolId);
  if (!pool) {
    throw new Error('Accountability pool not found.');
  }
  const participant = pool.participants.find((p) => p.walletPubkey === params.targetWalletPubkey);
  if (!participant) {
    throw new Error('Participant not found in this pool.');
  }
  if (participant.isEliminated) {
    throw new Error('Participant is already slashed.');
  }
  if (participant.lastCheckinDay >= params.dayIndex) {
    throw new Error(`Participant already verified Day ${params.dayIndex}.`);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const dayDeadline = pool.startTimestampSec + params.dayIndex * 86_400;
  if (nowSec <= dayDeadline) {
    throw new Error(`Day ${params.dayIndex} deadline has not passed yet.`);
  }

  participant.isEliminated = true;
  participant.slashTxSignature = params.slashTxSignature;
  pool.activeParticipants = Math.max(0, pool.activeParticipants - 1);
  pool.forfeitedVaultBalance = Number((pool.forfeitedVaultBalance + pool.stakeAmount).toFixed(2));
  return pool;
}

export function computeStepStakeClaimQuote(params: {
  poolId: string;
  walletPubkey: string;
  requestedDayIndex?: number;
}): {
  pool: StepStakePool;
  participant: StepStakeParticipant;
  dayIndex: number;
  principalAmount: number;
  bonusShare: number;
  payout: number;
  isFinalDay: boolean;
} {
  const pool = getStepStakePoolById(params.poolId);
  if (!pool) {
    throw new Error('Accountability pool not found.');
  }
  const participant = pool.participants.find((p) => p.walletPubkey === params.walletPubkey);
  if (!participant) {
    throw new Error('You are not a participant in this pool.');
  }
  if (participant.isEliminated) {
    throw new Error('Slashed participants cannot claim rewards.');
  }

  const claimedDays = participant.claimedDays || [];
  const claimedSet = new Set(claimedDays.map((c) => c.dayIndex));
  if (participant.hasClaimed || claimedSet.size >= pool.durationDays) {
    throw new Error('All daily payouts for this pool have already been claimed.');
  }

  // Determine which verified day is being claimed (either requested or next unclaimed verified day)
  let targetDay: number | null = null;
  if (
    typeof params.requestedDayIndex === 'number' &&
    Number.isInteger(params.requestedDayIndex) &&
    params.requestedDayIndex >= 1 &&
    params.requestedDayIndex <= pool.durationDays
  ) {
    targetDay = params.requestedDayIndex;
  } else {
    for (let d = 1; d <= participant.lastCheckinDay; d++) {
      if (!claimedSet.has(d)) {
        targetDay = d;
        break;
      }
    }
  }

  if (targetDay === null) {
    throw new Error(
      participant.lastCheckinDay === 0
        ? 'Complete and verify your Day 1 proof on-chain before claiming.'
        : `All ${participant.lastCheckinDay} verified day(s) have already been claimed. Complete Day ${Math.min(pool.durationDays, participant.lastCheckinDay + 1)} to unlock the next payout.`
    );
  }

  if (targetDay > participant.lastCheckinDay) {
    throw new Error(`Verify Day ${targetDay} proof on-chain before claiming Day ${targetDay}.`);
  }
  if (claimedSet.has(targetDay)) {
    throw new Error(`Day ${targetDay} payout has already been claimed.`);
  }

  const breakdown = calculateDailyPayoutBreakdown({
    totalStake: pool.stakeAmount,
    totalDays: pool.durationDays,
    token: pool.tokenSymbol,
    visibility: pool.visibility,
    dayIndex: targetDay,
  });

  const isFinalDay = targetDay === pool.durationDays;
  const survivors = Math.max(1, pool.activeParticipants);
  const baseBonus = isFinalDay && pool.forfeitedVaultBalance > 0 ? pool.forfeitedVaultBalance / survivors : 0;
  const weightedBonus = Number(((baseBonus * pool.skrMultiplierBps) / 10_000).toFixed(2));
  const principalAmount = breakdown.principalForDay;
  const payout = Number((principalAmount + weightedBonus).toFixed(2));

  return {
    pool,
    participant,
    dayIndex: targetDay,
    principalAmount,
    bonusShare: weightedBonus,
    payout,
    isFinalDay,
  };
}

export function settleAndClaimStepStakeRecord(params: {
  poolId: string;
  walletPubkey: string;
  claimTxSignature: string;
  claimSolscanUrl: string;
  dayIndex?: number;
  payoutTxSignature?: string | null;
  payoutSolscanUrl?: string | null;
  payoutStatus: StepStakePayoutStatus;
  payoutDetail?: string;
}): {
  pool: StepStakePool;
  dayIndex: number;
  principalAmount: number;
  bonusShare: number;
  payout: number;
  isFinalDay: boolean;
  claimReceipt: StepStakeDailyClaimReceipt;
} {
  const quote = computeStepStakeClaimQuote({
    poolId: params.poolId,
    walletPubkey: params.walletPubkey,
    requestedDayIndex: params.dayIndex,
  });

  const { pool, participant, dayIndex, principalAmount, bonusShare, payout, isFinalDay } = quote;

  const receipt: StepStakeDailyClaimReceipt = {
    dayIndex,
    principalAmount,
    bonusAmount: bonusShare,
    totalPayout: payout,
    claimTxSignature: params.claimTxSignature,
    claimSolscanUrl: params.claimSolscanUrl,
    payoutTxSignature: params.payoutTxSignature ?? null,
    payoutSolscanUrl: params.payoutSolscanUrl ?? null,
    payoutStatus: params.payoutStatus,
    payoutDetail: params.payoutDetail,
    claimedAt: new Date().toISOString(),
  };

  if (!Array.isArray(participant.claimedDays)) {
    participant.claimedDays = [];
  }
  participant.claimedDays.push(receipt);
  participant.claimedPrincipalTotal = Number(
    ((participant.claimedPrincipalTotal ?? 0) + principalAmount).toFixed(2)
  );
  participant.claimedPayout = Number(
    ((participant.claimedPayout ?? 0) + payout).toFixed(2)
  );
  participant.claimTxSignature = params.claimTxSignature;
  participant.payoutTxSignature = params.payoutTxSignature ?? participant.payoutTxSignature ?? null;
  participant.payoutStatus = params.payoutStatus;
  if (participant.claimedDays.length >= pool.durationDays) {
    participant.hasClaimed = true;
  }

  return {
    pool,
    dayIndex,
    principalAmount,
    bonusShare,
    payout,
    isFinalDay,
    claimReceipt: receipt,
  };
}
