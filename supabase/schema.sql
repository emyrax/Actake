-- Actake Web Platform — Supabase PostgreSQL Schema
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)

create extension if not exists "pgcrypto";

-- 1. Commitment Pools (Solo Alarms, Friend Squads, GPS Geo-Hunts)
create table if not exists public.pools (
  id text primary key,
  pool_pubkey text not null,
  pool_numeric_id bigint not null default 1,
  creator_pubkey text not null,
  title text not null,
  category_id text not null default 'morning_wakeup',
  environment_hint text not null default 'Bedroom, bathroom, or bright kitchen everyday object',
  token_symbol text not null check (token_symbol in ('USDC', 'SKR')) default 'USDC',
  mint text not null,
  pool_type smallint not null check (pool_type in (0, 1, 2)) default 1,
  stake_amount numeric(14, 2) not null check (stake_amount > 0),
  total_days integer not null default 7,
  alarm_hour smallint not null check (alarm_hour between 0 and 23) default 7,
  alarm_minute smallint not null check (alarm_minute between 0 and 59) default 0,
  daily_window_duration_sec integer not null default 900,
  target_lat double precision,
  target_lng double precision,
  radius_meters integer default 150,
  total_staked numeric(14, 2) not null default 0,
  participant_count integer not null default 1,
  total_successful_checkins integer not null default 0,
  slashed_pot_available numeric(14, 2) not null default 0,
  is_settled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_pools_created_at on public.pools (created_at desc);
create index if not exists idx_pools_type on public.pools (pool_type);

-- 2. Pool Participants (Mirrors Participant PDA state)
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  pool_id text not null references public.pools(id) on delete cascade,
  user_pubkey text not null,
  display_name text not null,
  staked_amount numeric(14, 2) not null,
  checkins_completed integer not null default 0,
  checkin_bitmap integer not null default 0,
  streak_days integer not null default 1,
  is_slashed boolean not null default false,
  has_claimed boolean not null default false,
  joined_tx_signature text not null,
  joined_at timestamptz not null default now(),
  unique (pool_id, user_pubkey)
);

create index if not exists idx_participants_pool on public.participants (pool_id);
create index if not exists idx_participants_user on public.participants (user_pubkey);

-- 3. Verified AI / GPS Check-In Proofs & Oracle Attestations
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  pool_id text not null references public.pools(id) on delete cascade,
  user_pubkey text not null,
  member_name text not null,
  initials text not null,
  day_index integer not null default 0,
  mission_type text not null default 'ITEM_SNAP',
  target_prompt text not null,
  verified boolean not null default true,
  confidence numeric(4, 3) not null default 0.95,
  reason text not null default '',
  proof_hash text not null,
  oracle_signature text not null,
  tx_signature text not null default '',
  onchain_confirmed boolean not null default false,
  status text not null check (status in ('verified', 'missed')) default 'verified',
  slashed_amount numeric(14, 2),
  likes integer not null default 0,
  fires integer not null default 0,
  streak integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_checkins_pool_created on public.checkins (pool_id, created_at desc);
create index if not exists idx_checkins_created on public.checkins (created_at desc);

-- 4. On-Chain Settlement & Payout Claim Receipts
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  pool_id text not null references public.pools(id) on delete cascade,
  user_pubkey text not null,
  token_symbol text not null check (token_symbol in ('USDC', 'SKR')) default 'USDC',
  principal_amount numeric(14, 2) not null,
  slashed_bonus numeric(14, 2) not null default 0,
  protocol_fee numeric(14, 2) not null default 0,
  total_payout numeric(14, 2) not null,
  tx_signature text not null default '',
  onchain_confirmed boolean not null default false,
  oracle_signature text not null default '',
  settled_at timestamptz not null default now()
);

create index if not exists idx_settlements_pool on public.settlements (pool_id);
create index if not exists idx_settlements_user on public.settlements (user_pubkey);

-- 5. Dual-Wallet Protocol Fee & Solo-Slash Treasury Ledger
create table if not exists public.treasury_ledger (
  id uuid primary key default gen_random_uuid(),
  pool_id text not null,
  pool_title text not null default 'Actake Commitment Pool',
  user_pubkey text not null,
  entry_type text not null check (entry_type in ('protocol_fee', 'solo_slash', 'zero_winner_slash')),
  token_symbol text not null check (token_symbol in ('USDC', 'SKR')) default 'USDC',
  amount numeric(14, 2) not null check (amount > 0),
  escrow_wallet text not null default '',
  treasury_wallet text not null default '',
  status text not null check (status in ('accrued', 'swept')) default 'accrued',
  tx_signature text not null default '',
  oracle_signature text not null default '',
  created_at timestamptz not null default now(),
  unique (pool_id, user_pubkey, entry_type)
);

create index if not exists idx_treasury_ledger_created on public.treasury_ledger (created_at desc);
create index if not exists idx_treasury_ledger_type on public.treasury_ledger (entry_type);

-- Enable Row Level Security (server accesses via SUPABASE_SERVICE_ROLE_KEY)
alter table public.pools enable row level security;
alter table public.participants enable row level security;
alter table public.checkins enable row level security;
alter table public.settlements enable row level security;
alter table public.treasury_ledger enable row level security;

-- Public read policies for companion web feed, Solana Blink discovery & Treasury transparency
drop policy if exists "Public read pools" on public.pools;
create policy "Public read pools" on public.pools for select using (true);

drop policy if exists "Public read participants" on public.participants;
create policy "Public read participants" on public.participants for select using (true);

drop policy if exists "Public read checkins" on public.checkins;
create policy "Public read checkins" on public.checkins for select using (true);

drop policy if exists "Public read settlements" on public.settlements;
create policy "Public read settlements" on public.settlements for select using (true);

drop policy if exists "Public read treasury_ledger" on public.treasury_ledger;
create policy "Public read treasury_ledger" on public.treasury_ledger for select using (true);

