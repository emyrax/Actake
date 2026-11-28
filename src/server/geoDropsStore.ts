import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type {
  CreateGeoHuntPayload,
  GeoCoordinate,
  GeoDropRadiusMeters,
  GeoDropTokenSymbol,
  GeoHuntRecord,
} from '../types/geodrops.ts';

let supabaseClient: SupabaseClient | null = null;
let supabaseInitDone = false;

function getGeoDropsSupabase(): SupabaseClient | null {
  if (supabaseInitDone) return supabaseClient;
  supabaseInitDone = true;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) {
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}

const SEED_ESCROW =
  process.env.ACTAKE_ESCROW_WALLET?.trim() ||
  '9xActakeEscrowVaultDevnet1111111111111111111';

const memoryHunts = new Map<string, GeoHuntRecord>();

function seedInitialGeoHunts(): void {
  if (memoryHunts.size > 0) return;

  const starterHunts: GeoHuntRecord[] = [
    {
      id: 'geodrop-ferry-plaza',
      title: 'Sunrise Seeker Vault',
      landmarkName: 'Ferry Building Waterfront Plaza',
      loreHint:
        'Face the clock tower steps near the palm promenade. The amber chest hovers right inside the open plaza ring.',
      creatorWallet: '7xActakeExplorer111111111111111111111111111',
      huntEscrowPubkey: SEED_ESCROW,
      fundingTxSignature: 'devnet-seed-geodrop-ferry-plaza',
      tokenSymbol: 'USDC',
      totalPoolAmount: 50,
      totalChests: 10,
      claimsRemaining: 7,
      rewardPerChest: 5,
      targetLat: 37.7955,
      targetLng: -122.3937,
      radiusMeters: 25,
      geofencePolygon: [
        { lat: 37.79572, lng: -122.39398 },
        { lat: 37.79575, lng: -122.39342 },
        { lat: 37.79528, lng: -122.39338 },
        { lat: 37.79526, lng: -122.39396 },
      ],
      isPublic: true,
      participants: [
        '7xActakeExplorer111111111111111111111111111',
        '4kSolanaRunner22222222222222222222222222222',
        '9mSeekerScout333333333333333333333333333333',
      ],
      claimedBy: [
        '4kSolanaRunner22222222222222222222222222222',
        '9mSeekerScout333333333333333333333333333333',
        '2pDawnSprinter44444444444444444444444444444',
      ],
      createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    },
    {
      id: 'geodrop-campus-quad',
      title: 'Emerald SKR Relay Drop',
      landmarkName: 'Central Campus Clock Quad',
      loreHint:
        'Walk to the stone amphitheater lawn in the center of the quad and align north-east for the floating SKR vault.',
      creatorWallet: '5vCampusHost5555555555555555555555555555555',
      huntEscrowPubkey: SEED_ESCROW,
      fundingTxSignature: 'devnet-seed-geodrop-campus-quad',
      tokenSymbol: 'SKR',
      totalPoolAmount: 120,
      totalChests: 12,
      claimsRemaining: 9,
      rewardPerChest: 10,
      targetLat: 40.7308,
      targetLng: -73.9973,
      radiusMeters: 50,
      geofencePolygon: null,
      isPublic: true,
      participants: [
        '5vCampusHost5555555555555555555555555555555',
        '8nBuilderGuild66666666666666666666666666666',
      ],
      claimedBy: [
        '8nBuilderGuild66666666666666666666666666666',
        '3zNightOwl777777777777777777777777777777777',
        '6wTrailRunner888888888888888888888888888888',
      ],
      createdAt: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
    },
    {
      id: 'geodrop-shoreditch-courtyard',
      title: 'Builders Courtyard Stash',
      landmarkName: 'Shoreditch Foundry Courtyard',
      loreHint:
        'Tight 15m geofence right beside the brick archway mural. Bring steady GPS lock or test indoors first.',
      creatorWallet: '6dFoundryDrop999999999999999999999999999999',
      huntEscrowPubkey: SEED_ESCROW,
      fundingTxSignature: 'devnet-seed-geodrop-shoreditch',
      tokenSymbol: 'USDC',
      totalPoolAmount: 40,
      totalChests: 8,
      claimsRemaining: 6,
      rewardPerChest: 5,
      targetLat: 51.5246,
      targetLng: -0.0781,
      radiusMeters: 15,
      geofencePolygon: null,
      isPublic: true,
      participants: ['6dFoundryDrop999999999999999999999999999999'],
      claimedBy: [
        '1aLondonWalker11111111111111111111111111111',
        '2bCoffeeRun22222222222222222222222222222222',
      ],
      createdAt: new Date(Date.now() - 1000 * 60 * 340).toISOString(),
    },
  ];

  for (const h of starterHunts) {
    memoryHunts.set(h.id, h);
  }
}

seedInitialGeoHunts();

function normalizePolygon(raw: unknown): GeoCoordinate[] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const cleaned: GeoCoordinate[] = [];
  for (const pt of raw.slice(0, 20)) {
    if (
      pt &&
      typeof pt === 'object' &&
      typeof (pt as GeoCoordinate).lat === 'number' &&
      typeof (pt as GeoCoordinate).lng === 'number' &&
      Number.isFinite((pt as GeoCoordinate).lat) &&
      Number.isFinite((pt as GeoCoordinate).lng) &&
      (pt as GeoCoordinate).lat >= -90 &&
      (pt as GeoCoordinate).lat <= 90 &&
      (pt as GeoCoordinate).lng >= -180 &&
      (pt as GeoCoordinate).lng <= 180
    ) {
      cleaned.push({
        lat: Number((pt as GeoCoordinate).lat.toFixed(6)),
        lng: Number((pt as GeoCoordinate).lng.toFixed(6)),
      });
    }
  }
  return cleaned.length >= 3 ? cleaned : null;
}

interface SupabaseGeoHuntRow {
  id: string;
  title: string;
  landmark_name: string;
  lore_hint: string;
  creator_wallet: string;
  hunt_escrow_pubkey: string;
  funding_tx_signature: string;
  token_symbol: GeoDropTokenSymbol;
  total_pool_amount: number | string;
  total_chests: number;
  claims_remaining: number;
  reward_per_chest: number | string;
  target_lat: number;
  target_lng: number;
  radius_meters: GeoDropRadiusMeters;
  geofence_polygon: GeoCoordinate[] | null;
  is_public: boolean;
  created_at: string;
}

interface SupabaseParticipantRow {
  hunt_id: string;
  wallet_pubkey: string;
  has_claimed: boolean;
}

function hydrateRow(
  row: SupabaseGeoHuntRow,
  participantRows: SupabaseParticipantRow[]
): GeoHuntRecord {
  const matching = participantRows.filter((p) => p.hunt_id === row.id);
  const participants = Array.from(new Set(matching.map((p) => p.wallet_pubkey)));
  const claimedBy = Array.from(
    new Set(matching.filter((p) => p.has_claimed).map((p) => p.wallet_pubkey))
  );
  return {
    id: row.id,
    title: row.title,
    landmarkName: row.landmark_name,
    loreHint: row.lore_hint || '',
    creatorWallet: row.creator_wallet,
    huntEscrowPubkey: row.hunt_escrow_pubkey,
    fundingTxSignature: row.funding_tx_signature || '',
    tokenSymbol: row.token_symbol === 'SKR' ? 'SKR' : 'USDC',
    totalPoolAmount: Number(row.total_pool_amount),
    totalChests: Number(row.total_chests),
    claimsRemaining: Number(row.claims_remaining),
    rewardPerChest: Number(row.reward_per_chest),
    targetLat: Number(row.target_lat),
    targetLng: Number(row.target_lng),
    radiusMeters:
      row.radius_meters === 15 || row.radius_meters === 50 ? row.radius_meters : 25,
    geofencePolygon: normalizePolygon(row.geofence_polygon),
    isPublic: Boolean(row.is_public),
    participants,
    claimedBy,
    createdAt: row.created_at,
  };
}

export async function listPublicGeoHunts(): Promise<{
  storageMode: 'supabase' | 'memory';
  hunts: GeoHuntRecord[];
}> {
  const sb = getGeoDropsSupabase();
  if (sb) {
    try {
      const { data: huntRows, error } = await sb
        .from('geo_hunts')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && Array.isArray(huntRows)) {
        const huntIds = huntRows.map((h) => h.id);
        let participantRows: SupabaseParticipantRow[] = [];
        if (huntIds.length > 0) {
          const { data: pRows } = await sb
            .from('hunt_participants')
            .select('hunt_id, wallet_pubkey, has_claimed')
            .in('hunt_id', huntIds);
          if (Array.isArray(pRows)) {
            participantRows = pRows as SupabaseParticipantRow[];
          }
        }
        const hydrated = (huntRows as SupabaseGeoHuntRow[]).map((row) =>
          hydrateRow(row, participantRows)
        );
        // If table exists but is empty, blend in memory hunts so new setups still show starter hunts
        if (hydrated.length > 0) {
          return { storageMode: 'supabase', hunts: hydrated };
        }
      }
    } catch {
      // Fall back cleanly to memory store if geo_hunts table hasn't been migrated yet
    }
  }

  seedInitialGeoHunts();
  const hunts = Array.from(memoryHunts.values())
    .filter((h) => h.isPublic)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { storageMode: 'memory', hunts };
}

export async function getGeoHuntById(id: string): Promise<GeoHuntRecord | null> {
  const sb = getGeoDropsSupabase();
  if (sb) {
    try {
      const { data: row, error } = await sb
        .from('geo_hunts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && row) {
        const { data: pRows } = await sb
          .from('hunt_participants')
          .select('hunt_id, wallet_pubkey, has_claimed')
          .eq('hunt_id', id);
        return hydrateRow(
          row as SupabaseGeoHuntRow,
          Array.isArray(pRows) ? (pRows as SupabaseParticipantRow[]) : []
        );
      }
    } catch {
      // fall through to memory store
    }
  }

  seedInitialGeoHunts();
  return memoryHunts.get(id) || null;
}

export async function createGeoHunt(input: CreateGeoHuntPayload): Promise<{
  storageMode: 'supabase' | 'memory';
  hunt: GeoHuntRecord;
}> {
  const id = `geodrop-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const rewardPerChest = Number((input.totalPoolAmount / input.totalChests).toFixed(4));
  const polygon = normalizePolygon(input.geofencePolygon);
  const createdAt = new Date().toISOString();

  const record: GeoHuntRecord = {
    id,
    title: input.title.trim(),
    landmarkName: input.landmarkName.trim(),
    loreHint: input.loreHint.trim(),
    creatorWallet: input.creatorWallet.trim(),
    huntEscrowPubkey: input.huntEscrowPubkey.trim(),
    fundingTxSignature: input.fundingTxSignature.trim(),
    tokenSymbol: input.tokenSymbol,
    totalPoolAmount: Number(input.totalPoolAmount.toFixed(2)),
    totalChests: input.totalChests,
    claimsRemaining: input.totalChests,
    rewardPerChest,
    targetLat: Number(input.targetLat.toFixed(6)),
    targetLng: Number(input.targetLng.toFixed(6)),
    radiusMeters: input.radiusMeters,
    geofencePolygon: polygon,
    isPublic: input.isPublic !== false,
    participants: [input.creatorWallet.trim()],
    claimedBy: [],
    createdAt,
  };

  memoryHunts.set(record.id, record);

  const sb = getGeoDropsSupabase();
  if (sb) {
    try {
      const { error } = await sb.from('geo_hunts').insert({
        id: record.id,
        title: record.title,
        landmark_name: record.landmarkName,
        lore_hint: record.loreHint,
        creator_wallet: record.creatorWallet,
        hunt_escrow_pubkey: record.huntEscrowPubkey,
        funding_tx_signature: record.fundingTxSignature,
        token_symbol: record.tokenSymbol,
        total_pool_amount: record.totalPoolAmount,
        total_chests: record.totalChests,
        claims_remaining: record.claimsRemaining,
        reward_per_chest: record.rewardPerChest,
        target_lat: record.targetLat,
        target_lng: record.targetLng,
        radius_meters: record.radiusMeters,
        geofence_polygon: record.geofencePolygon,
        is_public: record.isPublic,
        created_at: record.createdAt,
      });
      if (!error) {
        await sb.from('hunt_participants').upsert(
          {
            hunt_id: record.id,
            wallet_pubkey: record.creatorWallet,
            has_claimed: false,
          },
          { onConflict: 'hunt_id,wallet_pubkey' }
        );
        return { storageMode: 'supabase', hunt: record };
      }
    } catch {
      // Keep memory record
    }
  }

  return { storageMode: 'memory', hunt: record };
}

export async function joinGeoHunt(
  huntId: string,
  walletPubkey: string
): Promise<GeoHuntRecord | null> {
  const existing = await getGeoHuntById(huntId);
  if (!existing) return null;

  const updatedParticipants = existing.participants.includes(walletPubkey)
    ? existing.participants
    : [...existing.participants, walletPubkey];

  const updated: GeoHuntRecord = {
    ...existing,
    participants: updatedParticipants,
  };

  memoryHunts.set(huntId, updated);

  const sb = getGeoDropsSupabase();
  if (sb) {
    try {
      await sb.from('hunt_participants').upsert(
        {
          hunt_id: huntId,
          wallet_pubkey: walletPubkey,
        },
        { onConflict: 'hunt_id,wallet_pubkey', ignoreDuplicates: true }
      );
    } catch {
      // memory fallback already updated
    }
  }

  return updated;
}

export async function recordGeoHuntClaim(params: {
  huntId: string;
  hunterPubkey: string;
  claimTxSignature: string;
  oracleSignature: string;
}): Promise<{ hunt: GeoHuntRecord; alreadyClaimed: boolean } | null> {
  const existing = await getGeoHuntById(params.huntId);
  if (!existing) return null;

  if (existing.claimedBy.includes(params.hunterPubkey)) {
    return { hunt: existing, alreadyClaimed: true };
  }
  if (existing.claimsRemaining <= 0) {
    throw new Error('All chests in this GeoDrop hunt have already been claimed.');
  }

  const nextRemaining = Math.max(0, existing.claimsRemaining - 1);
  const nextParticipants = existing.participants.includes(params.hunterPubkey)
    ? existing.participants
    : [...existing.participants, params.hunterPubkey];
  const nextClaimedBy = [...existing.claimedBy, params.hunterPubkey];

  const updated: GeoHuntRecord = {
    ...existing,
    claimsRemaining: nextRemaining,
    participants: nextParticipants,
    claimedBy: nextClaimedBy,
  };

  memoryHunts.set(params.huntId, updated);

  const sb = getGeoDropsSupabase();
  if (sb) {
    try {
      await sb.from('hunt_participants').upsert(
        {
          hunt_id: params.huntId,
          wallet_pubkey: params.hunterPubkey,
          has_claimed: true,
          claim_tx_signature: params.claimTxSignature,
          oracle_signature: params.oracleSignature,
          claimed_at: new Date().toISOString(),
        },
        { onConflict: 'hunt_id,wallet_pubkey' }
      );
      await sb
        .from('geo_hunts')
        .update({ claims_remaining: nextRemaining })
        .eq('id', params.huntId);
    } catch {
      // memory state already updated
    }
  }

  return { hunt: updated, alreadyClaimed: false };
}
