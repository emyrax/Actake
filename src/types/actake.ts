export type TokenType = 'USDC' | 'SKR';

export type AppTab = 'home' | 'missions' | 'hunts' | 'squads' | 'history' | 'settings';

export type AlarmSoundId = 'mayhem' | 'siren' | 'rooster' | 'baby' | 'buzzer';

export interface HabitCategory {
  id: string;
  name: string;
  subtitle: string;
  environmentHint: string;
  iconKey: 'toothbrush' | 'dumbbell' | 'bed' | 'book' | 'grass' | 'kitchen' | 'custom';
  isCustom?: boolean;
}

export interface StakeCommitment {
  id: string;
  categoryId: string;
  categoryName: string;
  environmentHint: string;
  motivationNote?: string;
  frequencyLabel?: string;
  amount: number;
  token: TokenType;
  protocolFeePct: number;
  alarmHour: number; // 0-23
  alarmMinute: number; // 0-59
  alarmSound: AlarmSoundId;
  escrowPda: string;
  escrowWallet?: string;
  treasuryWallet?: string;
  joinTxSignature: string;
  slashedTxSignature?: string;
  paidVia?: 'pollar' | 'solana-tx';
  onchainConfirmed?: boolean;
  explorerUrl?: string;
  recentBlockhash: string;
  createdAt: number;
  status: 'locked' | 'ringing' | 'verified' | 'claimed' | 'slashed';
  squadName?: string;
  slashedBonusEstimate: number;
}

export interface RandomizedTargetPrompt {
  challengeId: string;
  stakeId: string;
  itemName: string;
  visualCue: string;
  antiCheatRule: string;
  referenceImageDataUrl: string;
  generatedAt: number;
  model: string;
}

export interface VerificationResult {
  verified: boolean;
  liveConfirmed: boolean;
  confidence: number;
  detectedObject: string;
  reasoning: string;
  photoSha256: string;
  oracleSignature: string;
  oraclePublicKey: string;
  messageBytesHex?: string;
  verifiedAt: number;
  model: string;
}

export interface CelebrationReceipt {
  stakeId: string;
  categoryName: string;
  verifiedItemName: string;
  verifiedTimeLabel: string;
  principalAmount: number;
  slashedBonus: number;
  totalEarned: number;
  token: TokenType;
  actPointsAwarded: number;
  streakCount: number;
  checkinTxSignature: string;
  checkinOnchainConfirmed?: boolean;
  checkinExplorerUrl?: string;
  claimTxSignature?: string;
  claimOnchainConfirmed?: boolean;
  claimExplorerUrl?: string;
  photoSha256: string;
  oracleSignature: string;
  escrowPda: string;
  blinkUrl: string;
  claimed: boolean;
  confirmationMs: number;
}

export interface HistoryEntry {
  id: string;
  dateIso: string;
  habitTitle: string;
  verifiedItem: string;
  token: TokenType;
  principal: number;
  bonus: number;
  totalPayout: number;
  txSignature: string;
  onchainConfirmed?: boolean;
  explorerUrl?: string;
  status: 'claimed' | 'verified' | 'slashed';
}

export interface SquadFeedItem {
  id: string;
  memberName: string;
  initials: string;
  timeLabel: string;
  streak: number;
  itemVerified: string;
  status: 'verified' | 'missed';
  slashedAmount?: number;
  likes: number;
  fires: number;
  userLiked?: boolean;
  userFired?: boolean;
}

export interface SquadMemberStanding {
  id: string;
  memberName: string;
  initials: string;
  walletHint?: string;
  status: 'verified' | 'active' | 'slashed';
  checkinsCompleted: number;
  totalDays: number;
  streakDays: number;
  stakedAmount: number;
  lastProofLabel: string;
  slashedAmount?: number;
  likes?: number;
  fires?: number;
}

export interface SquadPool {
  id: string;
  name: string;
  description?: string;
  categoryLabel?: string;
  verificationRule?: string;
  durationDays?: number;
  poolPubkey?: string;
  alarmTimeLabel: string;
  alarmHour?: number;
  alarmMinute?: number;
  stakeAmount: number;
  token: TokenType;
  memberCount: number;
  checkedInPct: number;
  totalPot: number;
  slashedPot: number;
  blinkUrl: string;
  lobbyUrl?: string;
  members?: SquadMemberStanding[];
  feed: SquadFeedItem[];
}

export interface LiveCheckinRecord {
  id: string;
  poolId: string;
  poolTitle?: string;
  tokenSymbol?: TokenType;
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
  recentCheckins: LiveCheckinRecord[];
}

export interface GeoHuntZone {
  id: string;
  title: string;
  category: 'Running' | 'Campus Hunt' | 'Gym Check-in';
  alarmTimeLabel: string;
  poolUsd: number;
  targetLatOffset: number;
  targetLngOffset: number;
  radiusMeters: number;
  participantCount: number;
  targetItemHint: string;
}

export interface AlarmSettings {
  selectedSound: AlarmSoundId;
  strictMode: boolean;
  volume: number;
}

export type WalletConnectionKind = 'pollar' | 'mwa' | 'wallet-standard' | 'browser-vault';

export interface WalletSession {
  publicKey: string;
  walletName: string;
  connectionKind: WalletConnectionKind;
  authToken: string;
  siwsSignature: string;
  connectedAt: number;
  chain: 'solana:devnet' | 'solana:mainnet';
  pollarProvider?: string;
  pollarCustody?: 'internal' | 'smart' | 'external';
}

export interface DiscoveredWalletOption {
  id: string;
  name: string;
  icon?: string;
  kind: WalletConnectionKind;
  description: string;
  available: boolean;
}

export interface PlatformCompatibility {
  os: 'android' | 'ios' | 'desktop';
  browser: 'chrome' | 'safari' | 'firefox' | 'edge' | 'other';
  mwaSupported: boolean;
  summary: string;
}

export interface DevnetSyncState {
  slot: number | null;
  solBalance: number | null;
  blockhash: string | null;
  lastSyncedAt: number | null;
  syncing: boolean;
  error: string | null;
}

export interface SystemReadinessReport {
  checkedAt: string;
  gemini: {
    configured: boolean;
  };
  supabase: {
    configured: boolean;
    reachable: boolean;
    mode: 'postgresql' | 'memory-fallback';
    detail?: string;
  };
  solanaRpc: {
    customEndpoint: boolean;
    cluster: 'devnet' | 'mainnet';
    reachable: boolean;
    liveSlot: number | null;
    latencyMs: number | null;
  };
  oracle: {
    persistentKey: boolean;
    publicKeyHex: string;
    publicKeyBase58: string;
  };
  escrowProgram: {
    programId: string;
    customDeployed: boolean;
    mode: 'anchor-escrow' | 'devnet-memo-ed25519';
  };
  blinks: {
    origin: string;
    actionsJsonUrl: string;
  };
  treasury: TreasuryConfigSummary;
}

export type TreasuryEntryType = 'protocol_fee' | 'solo_slash' | 'zero_winner_slash';

export interface TreasuryConfigSummary {
  escrowWallet: string | null;
  treasuryWallet: string | null;
  escrowConfigured: boolean;
  treasuryConfigured: boolean;
  pollarSafeForRealDeposits: boolean;
  usdcProtocolFeePct: number;
  skrProtocolFeePct: number;
  soloSlashRouting: '100_percent_treasury';
}

export interface TreasuryLedgerEntry {
  id: string;
  poolId: string;
  poolTitle: string;
  userPubkey: string;
  entryType: TreasuryEntryType;
  tokenSymbol: TokenType;
  amount: number;
  escrowWallet: string;
  treasuryWallet: string;
  status: 'accrued' | 'swept';
  txSignature: string;
  oracleSignature: string;
  createdAt: string;
}

export interface TreasurySummaryReport {
  storageMode: 'supabase' | 'memory';
  config: TreasuryConfigSummary;
  totals: {
    activeEscrowUsdc: number;
    activeEscrowSkr: number;
    protocolFeesUsdc: number;
    protocolFeesSkr: number;
    soloSlashedUsdc: number;
    soloSlashedSkr: number;
    totalTreasuryUsdc: number;
    totalTreasurySkr: number;
  };
  recentEntries: TreasuryLedgerEntry[];
}

