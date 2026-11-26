import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export type PoolTokenSymbol = 'USDC' | 'SKR';

export interface StoredPool {
  id: string;
  poolPubkey: string;
  poolNumericId: number;
  creatorPubkey: string;
  title: string;
  categoryId: string;
  environmentHint: string;
  tokenSymbol: PoolTokenSymbol;
  mint: string;
  poolType: 0 | 1 | 2; // 0 = Solo Alarm, 1 = Friend Squad, 2 = GPS Geo-Hunt
  stakeAmount: number;
  totalDays: number;
  alarmHour: number;
  alarmMinute: number;
  dailyWindowDurationSec: number;
  targetLat: number | null;
  targetLng: number | null;
  radiusMeters: number;
  totalStaked: number;
  participantCount: number;
  totalSuccessfulCheckins: number;
  slashedPotAvailable: number;
  isSettled: boolean;
  createdAt: string;
}

export interface StoredParticipant {
  id: string;
  poolId: string;
  userPubkey: string;
  displayName: string;
  stakedAmount: number;
  checkinsCompleted: number;
  checkinBitmap: number;
  streakDays: number;
  isSlashed: boolean;
  hasClaimed: boolean;
  joinedTxSignature: string;
  joinedAt: string;
}

export interface StoredCheckin {
  id: string;
  poolId: string;
  poolTitle?: string;
  tokenSymbol?: PoolTokenSymbol;
  userPubkey: string;
  memberName: string;
  initials: string;
  dayIndex: number;
  missionType: string;
  targetPrompt: string;
  verified: boolean;
  confidence: number;
  reason: string;
  proofHash: string;
  oracleSignature: string;
  txSignature: string;
  status: 'verified' | 'missed';
  slashedAmount?: number;
  likes: number;
  fires: number;
  streak: number;
  createdAt: string;
}

export interface GlobalActivitySummary {
  storageMode: 'supabase' | 'memory';
  totalUsdcStaked: number;
  totalSkrStaked: number;
  activePoolsCount: number;
  slashedDistributedUsd: number;
  totalVerifiedCheckins: number;
  recentCheckins: StoredCheckin[];
}

const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const SKR_MINT = 'SKR1111111111111111111111111111111111111111';

let supabaseClient: SupabaseClient | null | undefined = undefined;
let supabaseSchemaMissingUntil = 0;
let loggedSchemaNotice = false;

function isMissingSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /could not find the table|schema cache|does not exist/i.test(msg)
  );
}

function handleSupabaseQueryError(
  context: string,
  err: { code?: string; message?: string } | null | undefined
): void {
  if (isMissingSchemaError(err)) {
    // Back off Supabase table queries for 30s so the app runs cleanly on memory fallback
    // until the user executes supabase/schema.sql in their Supabase SQL Editor.
    supabaseSchemaMissingUntil = Date.now() + 30_000;
    if (!loggedSchemaNotice) {
      loggedSchemaNotice = true;
      console.info(
        'Actake Supabase connected — run supabase/schema.sql in your Supabase SQL Editor to enable PostgreSQL persistence (using memory fallback in the meantime).'
      );
    }
    return;
  }
  console.warn(`Supabase ${context} fallback:`, err?.message || 'unknown error');
}

function getSupabase(options?: { bypassSchemaBackoff?: boolean }): SupabaseClient | null {
  if (supabaseClient === undefined) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
      supabaseClient = null;
      return null;
    }
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  if (!supabaseClient) return null;
  if (!options?.bypassSchemaBackoff && Date.now() < supabaseSchemaMissingUntil) {
    return null;
  }
  return supabaseClient;
}

export function isSupabaseActive(): boolean {
  return getSupabase() !== null;
}

// Seeded fallback store so web squads, Blinks, and live activity feed work immediately
// before SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are added in Settings > Secrets.
const memoryPools = new Map<string, StoredPool>();
const memoryParticipants = new Map<string, StoredParticipant[]>();
const memoryCheckins: StoredCheckin[] = [];

function seedMemoryStore() {
  if (memoryPools.size > 0) return;

  const now = Date.now();
  const seedPools: StoredPool[] = [
    {
      id: 'squad-7am-club',
      poolPubkey: '7AMWakeClubPDA9x4k2mPq8vN1rT6wL3cF5bH2jY9uE',
      poolNumericId: 101,
      creatorPubkey: 'Seeker1111111111111111111111111111111111111',
      title: '7AM Campus Wake Club',
      categoryId: 'morning_wakeup',
      environmentHint: 'Bathroom sink, toothbrush, mug, or bright hallway away from bed',
      tokenSymbol: 'USDC',
      mint: USDC_MINT,
      poolType: 1,
      stakeAmount: 10,
      totalDays: 7,
      alarmHour: 7,
      alarmMinute: 0,
      dailyWindowDurationSec: 900,
      targetLat: null,
      targetLng: null,
      radiusMeters: 150,
      totalStaked: 185,
      participantCount: 45,
      totalSuccessfulCheckins: 168,
      slashedPotAvailable: 30,
      isSettled: false,
      createdAt: new Date(now - 5 * 86_400_000).toISOString(),
    },
    {
      id: 'squad-skr-builders',
      poolPubkey: '6AMBuildersSKRPDA3z8nK2pL7vR4wQ9mB6cT1xH5dF',
      poolNumericId: 102,
      creatorPubkey: 'Builder111111111111111111111111111111111111',
      title: 'Solana Builders 6AM SKR',
      categoryId: 'gym_fitness',
      environmentHint: 'Gym dumbbell, coffee mug, open notebook, or running sneakers',
      tokenSymbol: 'SKR',
      mint: SKR_MINT,
      poolType: 1,
      stakeAmount: 25,
      totalDays: 14,
      alarmHour: 6,
      alarmMinute: 0,
      dailyWindowDurationSec: 900,
      targetLat: null,
      targetLng: null,
      radiusMeters: 150,
      totalStaked: 475,
      participantCount: 19,
      totalSuccessfulCheckins: 142,
      slashedPotAvailable: 50,
      isSettled: false,
      createdAt: new Date(now - 3 * 86_400_000).toISOString(),
    },
    {
      id: 'hunt-stadium-run',
      poolPubkey: '630AMStadiumGeoPDA8k1pM4nV9xQ2cR7wL5bT3yF6j',
      poolNumericId: 201,
      creatorPubkey: 'Runner1111111111111111111111111111111111111',
      title: '6:30 AM Stadium Run Geo-Hunt',
      categoryId: 'outdoors_grass',
      environmentHint: 'Running shoe, stadium track, outdoor foliage, or hydration bottle',
      tokenSymbol: 'USDC',
      mint: USDC_MINT,
      poolType: 2,
      stakeAmount: 15,
      totalDays: 7,
      alarmHour: 6,
      alarmMinute: 30,
      dailyWindowDurationSec: 1200,
      targetLat: 37.7749,
      targetLng: -122.4194,
      radiusMeters: 150,
      totalStaked: 250,
      participantCount: 42,
      totalSuccessfulCheckins: 94,
      slashedPotAvailable: 45,
      isSettled: false,
      createdAt: new Date(now - 2 * 86_400_000).toISOString(),
    },
  ];

  for (const p of seedPools) {
    memoryPools.set(p.id, p);
  }

  memoryParticipants.set('squad-7am-club', [
    {
      id: 'part-alex',
      poolId: 'squad-7am-club',
      userPubkey: 'Alex9xK2mPq8vN1rT6wL3cF5bH2jY9uE7AMWakeClub',
      displayName: 'Alex',
      stakedAmount: 10,
      checkinsCompleted: 6,
      checkinBitmap: 0b111111,
      streakDays: 14,
      isSlashed: false,
      hasClaimed: false,
      joinedTxSignature: '5vAlexJoin7AMClubDevnetSig99x4m2',
      joinedAt: new Date(now - 5 * 86_400_000).toISOString(),
    },
    {
      id: 'part-sarah',
      poolId: 'squad-7am-club',
      userPubkey: 'Sarah4zGymPool8k2mPq8vN1rT6wL3cF5bH2jY9uE',
      displayName: 'Sarah',
      stakedAmount: 10,
      checkinsCompleted: 7,
      checkinBitmap: 0b1111111,
      streakDays: 32,
      isSlashed: false,
      hasClaimed: false,
      joinedTxSignature: '3kSarahJoin7AMClubDevnetSig88y9p1',
      joinedAt: new Date(now - 5 * 86_400_000).toISOString(),
    },
    {
      id: 'part-marcus',
      poolId: 'squad-7am-club',
      userPubkey: 'Marcus2yMissPool3q9nK2pL7vR4wQ9mB6cT1xH5dF',
      displayName: 'Marcus',
      stakedAmount: 10,
      checkinsCompleted: 3,
      checkinBitmap: 0b0000111,
      streakDays: 0,
      isSlashed: true,
      hasClaimed: false,
      joinedTxSignature: '2yMarcusJoin7AMClubDevnetSig5b8f',
      joinedAt: new Date(now - 4 * 86_400_000).toISOString(),
    },
  ]);

  memoryParticipants.set('squad-skr-builders', [
    {
      id: 'part-nina',
      poolId: 'squad-skr-builders',
      userPubkey: 'Nina6zSkrBuilder9c4d11m2nK8vJ7xQ2wR4pL5tH',
      displayName: 'Nina',
      stakedAmount: 25,
      checkinsCompleted: 11,
      checkinBitmap: 0b11111111111,
      streakDays: 21,
      isSlashed: false,
      hasClaimed: false,
      joinedTxSignature: '6zNinaJoinSkrPoolSig9c4d11m2nK8vJ',
      joinedAt: new Date(now - 3 * 86_400_000).toISOString(),
    },
  ]);

  memoryCheckins.push(
    {
      id: 'feed-alex',
      poolId: 'squad-7am-club',
      poolTitle: '7AM Campus Wake Club',
      tokenSymbol: 'USDC',
      userPubkey: 'Alex9xK2mPq8vN1rT6wL3cF5bH2jY9uE7AMWakeClub',
      memberName: 'Alex',
      initials: 'AL',
      dayIndex: 5,
      missionType: 'ITEM_SNAP',
      targetPrompt: 'Toothbrush Scanned',
      verified: true,
      confidence: 0.96,
      reason: 'Real 3D toothbrush next to ceramic bathroom sink confirmed.',
      proofHash: 'a94f82e1c30d7b54a8e910f24d18c765b4109f3e2d8c7a6b5f4e3d2c1b0a9f8e',
      oracleSignature: '8d1f3a5c7e9b2d4f6a8c0e2a4b6d8f0c1e3a5b7d9f1a3c5e7b9d1f3a5c7e9b2d',
      txSignature: '4xAlexCheckinEd25519Sig8a9c11k7mN2pQ',
      status: 'verified',
      likes: 8,
      fires: 5,
      streak: 14,
      createdAt: new Date(now - 42 * 60_000).toISOString(),
    },
    {
      id: 'feed-sarah',
      poolId: 'squad-7am-club',
      poolTitle: '7AM Campus Wake Club',
      tokenSymbol: 'USDC',
      userPubkey: 'Sarah4zGymPool8k2mPq8vN1rT6wL3cF5bH2jY9uE',
      memberName: 'Sarah',
      initials: 'SA',
      dayIndex: 6,
      missionType: 'ITEM_SNAP',
      targetPrompt: 'Gym Dumbbell',
      verified: true,
      confidence: 0.94,
      reason: 'Physical rubber hex dumbbell on gym floor with natural shadow depth.',
      proofHash: 'b72c91d4e60a8f23b9d021e35c29a876c5210a4f3e9d8b7c6a5f4e3d2c1b0a9d',
      oracleSignature: '4b6d8f0c1e3a5b7d9f1a3c5e7b9d1f3a5c7e9b2d8d1f3a5c7e9b2d4f6a8c0e2a',
      txSignature: '2ySarahCheckinEd25519Sig5b8f22r9tV4xW',
      status: 'verified',
      likes: 11,
      fires: 7,
      streak: 32,
      createdAt: new Date(now - 28 * 60_000).toISOString(),
    },
    {
      id: 'feed-nina',
      poolId: 'squad-skr-builders',
      poolTitle: 'Solana Builders 6AM SKR',
      tokenSymbol: 'SKR',
      userPubkey: 'Nina6zSkrBuilder9c4d11m2nK8vJ7xQ2wR4pL5tH',
      memberName: 'Nina',
      initials: 'NI',
      dayIndex: 10,
      missionType: 'ITEM_SNAP',
      targetPrompt: 'Coffee Mug Verified',
      verified: true,
      confidence: 0.97,
      reason: 'Ceramic espresso mug on wooden desk in natural morning window light.',
      proofHash: 'c83d02e5f71b9a34c0e132f46d30b987d6321b5a4f0e9c8d7b6a5f4e3d2c1b0e',
      oracleSignature: '9f1a3c5e7b9d1f3a5c7e9b2d8d1f3a5c7e9b2d4f6a8c0e2a4b6d8f0c1e3a5b7d',
      txSignature: '6zNinaCheckinSkrZeroFeeSig9c4d11m2nK8vJ',
      status: 'verified',
      likes: 6,
      fires: 9,
      streak: 21,
      createdAt: new Date(now - 15 * 60_000).toISOString(),
    },
    {
      id: 'feed-marcus',
      poolId: 'squad-7am-club',
      poolTitle: '7AM Campus Wake Club',
      tokenSymbol: 'USDC',
      userPubkey: 'Marcus2yMissPool3q9nK2pL7vR4wQ9mB6cT1xH5dF',
      memberName: 'Marcus',
      initials: 'MA',
      dayIndex: 5,
      missionType: 'ITEM_SNAP',
      targetPrompt: 'No Photo Submitted',
      verified: false,
      confidence: 0,
      reason: 'Missed 07:00 AM window. $10.00 USDC slashed into winners pot.',
      proofHash: '',
      oracleSignature: '',
      txSignature: '',
      status: 'missed',
      slashedAmount: 10,
      likes: 0,
      fires: 0,
      streak: 0,
      createdAt: new Date(now - 12 * 60_000).toISOString(),
    }
  );
}

seedMemoryStore();

function mapPoolRow(row: Record<string, unknown>): StoredPool {
  return {
    id: String(row.id),
    poolPubkey: String(row.pool_pubkey),
    poolNumericId: Number(row.pool_numeric_id ?? 1),
    creatorPubkey: String(row.creator_pubkey),
    title: String(row.title),
    categoryId: String(row.category_id ?? 'morning_wakeup'),
    environmentHint: String(row.environment_hint ?? ''),
    tokenSymbol: row.token_symbol === 'SKR' ? 'SKR' : 'USDC',
    mint: String(row.mint ?? USDC_MINT),
    poolType: (Number(row.pool_type ?? 1) as 0 | 1 | 2),
    stakeAmount: Number(row.stake_amount ?? 10),
    totalDays: Number(row.total_days ?? 7),
    alarmHour: Number(row.alarm_hour ?? 7),
    alarmMinute: Number(row.alarm_minute ?? 0),
    dailyWindowDurationSec: Number(row.daily_window_duration_sec ?? 900),
    targetLat: row.target_lat !== null && row.target_lat !== undefined ? Number(row.target_lat) : null,
    targetLng: row.target_lng !== null && row.target_lng !== undefined ? Number(row.target_lng) : null,
    radiusMeters: Number(row.radius_meters ?? 150),
    totalStaked: Number(row.total_staked ?? 0),
    participantCount: Number(row.participant_count ?? 1),
    totalSuccessfulCheckins: Number(row.total_successful_checkins ?? 0),
    slashedPotAvailable: Number(row.slashed_pot_available ?? 0),
    isSettled: Boolean(row.is_settled),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapParticipantRow(row: Record<string, unknown>): StoredParticipant {
  return {
    id: String(row.id),
    poolId: String(row.pool_id),
    userPubkey: String(row.user_pubkey),
    displayName: String(row.display_name ?? 'Member'),
    stakedAmount: Number(row.staked_amount ?? 10),
    checkinsCompleted: Number(row.checkins_completed ?? 0),
    checkinBitmap: Number(row.checkin_bitmap ?? 0),
    streakDays: Number(row.streak_days ?? 1),
    isSlashed: Boolean(row.is_slashed),
    hasClaimed: Boolean(row.has_claimed),
    joinedTxSignature: String(row.joined_tx_signature ?? ''),
    joinedAt: String(row.joined_at ?? new Date().toISOString()),
  };
}

function mapCheckinRow(row: Record<string, unknown>): StoredCheckin {
  return {
    id: String(row.id),
    poolId: String(row.pool_id),
    userPubkey: String(row.user_pubkey),
    memberName: String(row.member_name ?? 'Member'),
    initials: String(row.initials ?? 'MB'),
    dayIndex: Number(row.day_index ?? 0),
    missionType: String(row.mission_type ?? 'ITEM_SNAP'),
    targetPrompt: String(row.target_prompt ?? ''),
    verified: Boolean(row.verified),
    confidence: Number(row.confidence ?? 0),
    reason: String(row.reason ?? ''),
    proofHash: String(row.proof_hash ?? ''),
    oracleSignature: String(row.oracle_signature ?? ''),
    txSignature: String(row.tx_signature ?? ''),
    status: row.status === 'missed' ? 'missed' : 'verified',
    slashedAmount:
      row.slashed_amount !== null && row.slashed_amount !== undefined
        ? Number(row.slashed_amount)
        : undefined,
    likes: Number(row.likes ?? 0),
    fires: Number(row.fires ?? 0),
    streak: Number(row.streak ?? 1),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function listPools(poolType?: number): Promise<StoredPool[]> {
  const sb = getSupabase();
  if (sb) {
    try {
      let query = sb.from('pools').select('*').order('created_at', { ascending: false }).limit(50);
      if (poolType === 0 || poolType === 1 || poolType === 2) {
        query = query.eq('pool_type', poolType);
      }
      const { data, error } = await query;
      if (!error && data) {
        return data.map((r) => mapPoolRow(r as Record<string, unknown>));
      }
      handleSupabaseQueryError('listPools', error);
    } catch (err) {
      console.warn('Supabase listPools exception:', err instanceof Error ? err.message : err);
    }
  }

  const all = Array.from(memoryPools.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (poolType === 0 || poolType === 1 || poolType === 2) {
    return all.filter((p) => p.poolType === poolType);
  }
  return all;
}

export async function getPoolById(poolId: string): Promise<StoredPool | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from('pools').select('*').eq('id', poolId).maybeSingle();
      if (!error && data) {
        return mapPoolRow(data as Record<string, unknown>);
      }
      if (error) handleSupabaseQueryError('getPoolById', error);
    } catch (err) {
      console.warn('Supabase getPoolById exception:', err instanceof Error ? err.message : err);
    }
  }

  return memoryPools.get(poolId) || null;
}

export async function createPoolRecord(input: {
  id?: string;
  poolPubkey: string;
  creatorPubkey: string;
  creatorName?: string;
  title: string;
  categoryId?: string;
  environmentHint?: string;
  tokenSymbol: PoolTokenSymbol;
  poolType: 0 | 1 | 2;
  stakeAmount: number;
  totalDays?: number;
  alarmHour: number;
  alarmMinute: number;
  targetLat?: number | null;
  targetLng?: number | null;
  radiusMeters?: number;
  joinedTxSignature: string;
}): Promise<StoredPool> {
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 28);
  const id = input.id || `${slug || 'pool'}-${Date.now().toString(36)}`;
  const numericId = Math.floor(Date.now() % 1_000_000_000);
  const mint = input.tokenSymbol === 'SKR' ? SKR_MINT : USDC_MINT;
  const nowIso = new Date().toISOString();

  const pool: StoredPool = {
    id,
    poolPubkey: input.poolPubkey,
    poolNumericId: numericId,
    creatorPubkey: input.creatorPubkey,
    title: input.title,
    categoryId: input.categoryId || 'morning_wakeup',
    environmentHint:
      input.environmentHint || 'Everyday household object in natural room lighting',
    tokenSymbol: input.tokenSymbol,
    mint,
    poolType: input.poolType,
    stakeAmount: input.stakeAmount,
    totalDays: input.totalDays ?? 7,
    alarmHour: input.alarmHour,
    alarmMinute: input.alarmMinute,
    dailyWindowDurationSec: 900,
    targetLat: input.targetLat ?? null,
    targetLng: input.targetLng ?? null,
    radiusMeters: input.radiusMeters ?? 150,
    totalStaked: input.stakeAmount,
    participantCount: 1,
    totalSuccessfulCheckins: 0,
    slashedPotAvailable: 0,
    isSettled: false,
    createdAt: nowIso,
  };

  const displayName =
    input.creatorName?.trim() || `${input.creatorPubkey.slice(0, 4)}...${input.creatorPubkey.slice(-4)}`;

  const sb = getSupabase();
  if (sb) {
    try {
      const { error: poolErr } = await sb.from('pools').insert({
        id: pool.id,
        pool_pubkey: pool.poolPubkey,
        pool_numeric_id: pool.poolNumericId,
        creator_pubkey: pool.creatorPubkey,
        title: pool.title,
        category_id: pool.categoryId,
        environment_hint: pool.environmentHint,
        token_symbol: pool.tokenSymbol,
        mint: pool.mint,
        pool_type: pool.poolType,
        stake_amount: pool.stakeAmount,
        total_days: pool.totalDays,
        alarm_hour: pool.alarmHour,
        alarm_minute: pool.alarmMinute,
        daily_window_duration_sec: pool.dailyWindowDurationSec,
        target_lat: pool.targetLat,
        target_lng: pool.targetLng,
        radius_meters: pool.radiusMeters,
        total_staked: pool.totalStaked,
        participant_count: pool.participantCount,
        total_successful_checkins: 0,
        slashed_pot_available: 0,
        is_settled: false,
      });
      if (!poolErr) {
        await sb.from('participants').upsert(
          {
            pool_id: pool.id,
            user_pubkey: input.creatorPubkey,
            display_name: displayName,
            staked_amount: pool.stakeAmount,
            checkins_completed: 0,
            checkin_bitmap: 0,
            streak_days: 1,
            joined_tx_signature: input.joinedTxSignature,
          },
          { onConflict: 'pool_id,user_pubkey' }
        );
        return pool;
      }
      handleSupabaseQueryError('createPoolRecord', poolErr);
    } catch (err) {
      console.warn('Supabase createPoolRecord exception:', err instanceof Error ? err.message : err);
    }
  }

  memoryPools.set(pool.id, pool);
  memoryParticipants.set(pool.id, [
    {
      id: crypto.randomUUID(),
      poolId: pool.id,
      userPubkey: input.creatorPubkey,
      displayName,
      stakedAmount: pool.stakeAmount,
      checkinsCompleted: 0,
      checkinBitmap: 0,
      streakDays: 1,
      isSlashed: false,
      hasClaimed: false,
      joinedTxSignature: input.joinedTxSignature,
      joinedAt: nowIso,
    },
  ]);
  return pool;
}

export async function joinPoolRecord(
  poolId: string,
  input: {
    userPubkey: string;
    displayName?: string;
    joinedTxSignature: string;
  }
): Promise<{ pool: StoredPool; participant: StoredParticipant } | null> {
  const pool = await getPoolById(poolId);
  if (!pool) return null;

  const displayName =
    input.displayName?.trim() || `${input.userPubkey.slice(0, 4)}...${input.userPubkey.slice(-4)}`;
  const nowIso = new Date().toISOString();

  const sb = getSupabase();
  if (sb) {
    try {
      const { data: existing } = await sb
        .from('participants')
        .select('*')
        .eq('pool_id', poolId)
        .eq('user_pubkey', input.userPubkey)
        .maybeSingle();

      if (existing) {
        return {
          pool,
          participant: mapParticipantRow(existing as Record<string, unknown>),
        };
      }

      const { data: inserted, error: insertErr } = await sb
        .from('participants')
        .insert({
          pool_id: poolId,
          user_pubkey: input.userPubkey,
          display_name: displayName,
          staked_amount: pool.stakeAmount,
          checkins_completed: 0,
          checkin_bitmap: 0,
          streak_days: 1,
          joined_tx_signature: input.joinedTxSignature,
        })
        .select()
        .single();

      if (!insertErr && inserted) {
        const nextTotal = Number((pool.totalStaked + pool.stakeAmount).toFixed(2));
        const nextCount = pool.participantCount + 1;
        await sb
          .from('pools')
          .update({ total_staked: nextTotal, participant_count: nextCount })
          .eq('id', poolId);
        return {
          pool: { ...pool, totalStaked: nextTotal, participantCount: nextCount },
          participant: mapParticipantRow(inserted as Record<string, unknown>),
        };
      }
      handleSupabaseQueryError('joinPoolRecord', insertErr);
    } catch (err) {
      console.warn('Supabase joinPoolRecord exception:', err instanceof Error ? err.message : err);
    }
  }

  const list = memoryParticipants.get(poolId) || [];
  const existingMem = list.find((p) => p.userPubkey === input.userPubkey);
  if (existingMem) {
    return { pool, participant: existingMem };
  }

  const participant: StoredParticipant = {
    id: crypto.randomUUID(),
    poolId,
    userPubkey: input.userPubkey,
    displayName,
    stakedAmount: pool.stakeAmount,
    checkinsCompleted: 0,
    checkinBitmap: 0,
    streakDays: 1,
    isSlashed: false,
    hasClaimed: false,
    joinedTxSignature: input.joinedTxSignature,
    joinedAt: nowIso,
  };
  list.unshift(participant);
  memoryParticipants.set(poolId, list);

  const updatedPool: StoredPool = {
    ...pool,
    totalStaked: Number((pool.totalStaked + pool.stakeAmount).toFixed(2)),
    participantCount: pool.participantCount + 1,
  };
  memoryPools.set(poolId, updatedPool);

  return { pool: updatedPool, participant };
}

export async function getSquadFeedAndLeaderboard(poolId: string): Promise<{
  pool: StoredPool | null;
  participants: StoredParticipant[];
  checkins: StoredCheckin[];
}> {
  const pool = await getPoolById(poolId);
  if (!pool) {
    return { pool: null, participants: [], checkins: [] };
  }

  const sb = getSupabase();
  if (sb) {
    try {
      const [partRes, checkRes] = await Promise.all([
        sb
          .from('participants')
          .select('*')
          .eq('pool_id', poolId)
          .order('checkins_completed', { ascending: false }),
        sb
          .from('checkins')
          .select('*')
          .eq('pool_id', poolId)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      if (!partRes.error && !checkRes.error) {
        return {
          pool,
          participants: (partRes.data || []).map((r) =>
            mapParticipantRow(r as Record<string, unknown>)
          ),
          checkins: (checkRes.data || []).map((r) => ({
            ...mapCheckinRow(r as Record<string, unknown>),
            poolTitle: pool.title,
            tokenSymbol: pool.tokenSymbol,
          })),
        };
      }
      if (partRes.error || checkRes.error) {
        handleSupabaseQueryError('getSquadFeedAndLeaderboard', partRes.error || checkRes.error);
      }
    } catch (err) {
      console.warn(
        'Supabase getSquadFeedAndLeaderboard exception:',
        err instanceof Error ? err.message : err
      );
    }
  }

  const participants = [...(memoryParticipants.get(poolId) || [])].sort(
    (a, b) => b.checkinsCompleted - a.checkinsCompleted
  );
  const checkins = memoryCheckins
    .filter((c) => c.poolId === poolId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { pool, participants, checkins };
}

export async function recordVerifiedCheckin(input: {
  poolId: string;
  userPubkey: string;
  memberName?: string;
  dayIndex: number;
  missionType: string;
  targetPrompt: string;
  confidence: number;
  reason: string;
  proofHash: string;
  oracleSignature: string;
  txSignature?: string;
}): Promise<StoredCheckin> {
  const cleanName =
    input.memberName?.trim() || `${input.userPubkey.slice(0, 4)}...${input.userPubkey.slice(-4)}`;
  const initials = cleanName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AC';

  const pool = await getPoolById(input.poolId);
  const nowIso = new Date().toISOString();

  const checkin: StoredCheckin = {
    id: crypto.randomUUID(),
    poolId: pool ? pool.id : 'squad-7am-club',
    poolTitle: pool?.title || '7AM Campus Wake Club',
    tokenSymbol: pool?.tokenSymbol || 'USDC',
    userPubkey: input.userPubkey,
    memberName: cleanName,
    initials,
    dayIndex: input.dayIndex,
    missionType: input.missionType,
    targetPrompt: input.targetPrompt,
    verified: true,
    confidence: input.confidence,
    reason: input.reason,
    proofHash: input.proofHash,
    oracleSignature: input.oracleSignature,
    txSignature: input.txSignature || '',
    status: 'verified',
    likes: 1,
    fires: 1,
    streak: 1,
    createdAt: nowIso,
  };

  const sb = getSupabase();
  if (sb && pool) {
    try {
      const { data, error } = await sb
        .from('checkins')
        .insert({
          pool_id: pool.id,
          user_pubkey: checkin.userPubkey,
          member_name: checkin.memberName,
          initials: checkin.initials,
          day_index: checkin.dayIndex,
          mission_type: checkin.missionType,
          target_prompt: checkin.targetPrompt,
          verified: true,
          confidence: checkin.confidence,
          reason: checkin.reason,
          proof_hash: checkin.proofHash,
          oracle_signature: checkin.oracleSignature,
          tx_signature: checkin.txSignature,
          status: 'verified',
          likes: 1,
          fires: 1,
          streak: 1,
        })
        .select()
        .single();

      if (!error && data) {
        await sb
          .from('pools')
          .update({ total_successful_checkins: pool.totalSuccessfulCheckins + 1 })
          .eq('id', pool.id);
        return {
          ...mapCheckinRow(data as Record<string, unknown>),
          poolTitle: pool.title,
          tokenSymbol: pool.tokenSymbol,
        };
      }
      handleSupabaseQueryError('recordVerifiedCheckin', error);
    } catch (err) {
      console.warn(
        'Supabase recordVerifiedCheckin exception:',
        err instanceof Error ? err.message : err
      );
    }
  }

  memoryCheckins.unshift(checkin);
  if (pool) {
    memoryPools.set(pool.id, {
      ...pool,
      totalSuccessfulCheckins: pool.totalSuccessfulCheckins + 1,
    });
  }
  return checkin;
}

export async function reactToCheckin(
  checkinId: string,
  kind: 'like' | 'fire'
): Promise<{ likes: number; fires: number } | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: row } = await sb
        .from('checkins')
        .select('likes, fires')
        .eq('id', checkinId)
        .maybeSingle();

      if (row) {
        const nextLikes = Number(row.likes ?? 0) + (kind === 'like' ? 1 : 0);
        const nextFires = Number(row.fires ?? 0) + (kind === 'fire' ? 1 : 0);
        await sb
          .from('checkins')
          .update({ likes: nextLikes, fires: nextFires })
          .eq('id', checkinId);
        return { likes: nextLikes, fires: nextFires };
      }
    } catch (err) {
      console.error('Supabase reactToCheckin exception:', err);
    }
  }

  const found = memoryCheckins.find((c) => c.id === checkinId);
  if (!found) return null;
  if (kind === 'like') found.likes += 1;
  else found.fires += 1;
  return { likes: found.likes, fires: found.fires };
}

export async function getLiveGlobalActivity(): Promise<GlobalActivitySummary> {
  const pools = await listPools();
  let recentCheckins: StoredCheckin[] = [];
  let usedSupabase = false;

  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('checkins')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(12);
      if (!error && data) {
        usedSupabase = true;
        const poolMap = new Map(pools.map((p) => [p.id, p]));
        recentCheckins = data.map((r) => {
          const mapped = mapCheckinRow(r as Record<string, unknown>);
          const pool = poolMap.get(mapped.poolId);
          return {
            ...mapped,
            poolTitle: pool?.title || 'Actake Pool',
            tokenSymbol: pool?.tokenSymbol || 'USDC',
          };
        });
      } else if (error) {
        handleSupabaseQueryError('getLiveGlobalActivity', error);
      }
    } catch (err) {
      console.warn(
        'Supabase getLiveGlobalActivity exception:',
        err instanceof Error ? err.message : err
      );
    }
  }

  if (!usedSupabase) {
    recentCheckins = [...memoryCheckins]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }

  const totalUsdcStaked = pools
    .filter((p) => p.tokenSymbol === 'USDC')
    .reduce((acc, p) => acc + p.totalStaked, 0);
  const totalSkrStaked = pools
    .filter((p) => p.tokenSymbol === 'SKR')
    .reduce((acc, p) => acc + p.totalStaked, 0);
  const slashedDistributedUsd = pools.reduce((acc, p) => acc + p.slashedPotAvailable, 0);
  const totalVerifiedCheckins = pools.reduce((acc, p) => acc + p.totalSuccessfulCheckins, 0);

  return {
    storageMode: usedSupabase ? 'supabase' : 'memory',
    totalUsdcStaked: Number(totalUsdcStaked.toFixed(2)),
    totalSkrStaked: Number(totalSkrStaked.toFixed(2)),
    activePoolsCount: pools.length,
    slashedDistributedUsd: Number(slashedDistributedUsd.toFixed(2)),
    totalVerifiedCheckins,
    recentCheckins,
  };
}

export interface StoredSettlement {
  id: string;
  poolId: string;
  userPubkey: string;
  tokenSymbol: PoolTokenSymbol;
  principalAmount: number;
  slashedBonus: number;
  protocolFee: number;
  totalPayout: number;
  txSignature: string;
  onchainConfirmed: boolean;
  oracleSignature: string;
  settledAt: string;
}

const memorySettlements: StoredSettlement[] = [];

export async function checkSupabaseHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  mode: 'postgresql' | 'memory-fallback';
  detail?: string;
}> {
  const sb = getSupabase({ bypassSchemaBackoff: true });
  if (!sb) {
    return {
      configured: false,
      reachable: false,
      mode: 'memory-fallback',
      detail: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — using local memory fallback.',
    };
  }
  try {
    const { error } = await sb.from('pools').select('id').limit(1);
    if (error) {
      if (isMissingSchemaError(error)) {
        supabaseSchemaMissingUntil = Date.now() + 30_000;
        return {
          configured: true,
          reachable: false,
          mode: 'memory-fallback',
          detail:
            'Supabase is connected, but tables have not been created yet. Run supabase/schema.sql in your Supabase SQL Editor.',
        };
      }
      return {
        configured: true,
        reachable: false,
        mode: 'memory-fallback',
        detail: `Connected to Supabase, but schema check returned: ${error.message}`,
      };
    }
    // Schema exists! Immediately clear any backoff so queries switch straight to PostgreSQL.
    supabaseSchemaMissingUntil = 0;
    return {
      configured: true,
      reachable: true,
      mode: 'postgresql',
    };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      mode: 'memory-fallback',
      detail: err instanceof Error ? err.message : 'Unable to reach Supabase host.',
    };
  }
}

export async function computePoolSettlementQuote(params: {
  poolId: string;
  userPubkey: string;
  fallbackPrincipal?: number;
  fallbackToken?: PoolTokenSymbol;
}): Promise<{
  poolId: string;
  poolTitle: string;
  poolPubkey: string;
  tokenSymbol: PoolTokenSymbol;
  principalAmount: number;
  grossSlashedShare: number;
  protocolFeePct: number;
  protocolFee: number;
  netSlashedBonus: number;
  totalPayout: number;
  winnersCount: number;
  slashedPotAvailable: number;
}> {
  const pool = await getPoolById(params.poolId);
  const tokenSymbol: PoolTokenSymbol = pool?.tokenSymbol || params.fallbackToken || 'USDC';
  const principalAmount = Number(
    (pool?.stakeAmount ?? params.fallbackPrincipal ?? 10).toFixed(2)
  );
  const protocolFeePct = tokenSymbol === 'SKR' ? 0 : 1.5;

  let winnersCount = 1;
  let slashedPotAvailable = 0;

  if (pool) {
    const { participants } = await getSquadFeedAndLeaderboard(pool.id);
    const verifiedWinners = participants.filter((p) => !p.isSlashed && p.checkinsCompleted > 0).length;
    winnersCount = Math.max(1, verifiedWinners || Math.max(1, Math.round(pool.participantCount * 0.7)));
    slashedPotAvailable =
      pool.slashedPotAvailable > 0
        ? pool.slashedPotAvailable
        : Number((principalAmount * (tokenSymbol === 'SKR' ? 0.24 : 0.18) * winnersCount).toFixed(2));
  } else {
    slashedPotAvailable = Number(
      (principalAmount * (tokenSymbol === 'SKR' ? 0.24 : 0.18)).toFixed(2)
    );
  }

  const grossSlashedShare = Number((slashedPotAvailable / winnersCount).toFixed(2));
  const protocolFee = Number(((grossSlashedShare * protocolFeePct) / 100).toFixed(2));
  const netSlashedBonus = Number(Math.max(0, grossSlashedShare - protocolFee).toFixed(2));
  const totalPayout = Number((principalAmount + netSlashedBonus).toFixed(2));

  return {
    poolId: pool?.id || params.poolId,
    poolTitle: pool?.title || 'Actake Commitment Pool',
    poolPubkey: pool?.poolPubkey || 'ACTKescrow111111111111111111111111111111111',
    tokenSymbol,
    principalAmount,
    grossSlashedShare,
    protocolFeePct,
    protocolFee,
    netSlashedBonus,
    totalPayout,
    winnersCount,
    slashedPotAvailable: Number(slashedPotAvailable.toFixed(2)),
  };
}

export async function recordPoolSettlement(input: {
  poolId: string;
  userPubkey: string;
  tokenSymbol: PoolTokenSymbol;
  principalAmount: number;
  slashedBonus: number;
  protocolFee: number;
  totalPayout: number;
  txSignature: string;
  onchainConfirmed: boolean;
  oracleSignature: string;
}): Promise<StoredSettlement> {
  const nowIso = new Date().toISOString();
  const record: StoredSettlement = {
    id: crypto.randomUUID(),
    poolId: input.poolId,
    userPubkey: input.userPubkey,
    tokenSymbol: input.tokenSymbol,
    principalAmount: input.principalAmount,
    slashedBonus: input.slashedBonus,
    protocolFee: input.protocolFee,
    totalPayout: input.totalPayout,
    txSignature: input.txSignature,
    onchainConfirmed: input.onchainConfirmed,
    oracleSignature: input.oracleSignature,
    settledAt: nowIso,
  };

  const sb = getSupabase();
  if (sb) {
    try {
      const pool = await getPoolById(input.poolId);
      if (pool) {
        await sb.from('settlements').insert({
          pool_id: pool.id,
          user_pubkey: input.userPubkey,
          token_symbol: input.tokenSymbol,
          principal_amount: input.principalAmount,
          slashed_bonus: input.slashedBonus,
          protocol_fee: input.protocolFee,
          total_payout: input.totalPayout,
          tx_signature: input.txSignature,
          onchain_confirmed: input.onchainConfirmed,
          oracle_signature: input.oracleSignature,
        });
        await sb
          .from('participants')
          .update({ has_claimed: true })
          .eq('pool_id', pool.id)
          .eq('user_pubkey', input.userPubkey);
      }
    } catch (err) {
      console.warn('Supabase recordPoolSettlement note:', err instanceof Error ? err.message : err);
    }
  }

  memorySettlements.unshift(record);
  const memParts = memoryParticipants.get(input.poolId);
  if (memParts) {
    const found = memParts.find((p) => p.userPubkey === input.userPubkey);
    if (found) found.hasClaimed = true;
  }

  return record;
}

