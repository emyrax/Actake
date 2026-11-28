export type GeoDropTokenSymbol = 'SKR' | 'USDC';
export type GeoDropRadiusMeters = 15 | 25 | 50;

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

export interface HuntParticipantRecord {
  huntId: string;
  walletPubkey: string;
  hasClaimed: boolean;
  claimTxSignature?: string;
  oracleSignature?: string;
  joinedAt: string;
  claimedAt?: string | null;
}

export interface GeoHuntRecord {
  id: string;
  title: string;
  landmarkName: string;
  loreHint: string;
  creatorWallet: string;
  huntEscrowPubkey: string;
  fundingTxSignature: string;
  tokenSymbol: GeoDropTokenSymbol;
  totalPoolAmount: number;
  totalChests: number;
  claimsRemaining: number;
  rewardPerChest: number;
  targetLat: number;
  targetLng: number;
  radiusMeters: GeoDropRadiusMeters;
  /** Optional custom mapped geofence area polygon (3+ vertices on the real-world map) */
  geofencePolygon?: GeoCoordinate[] | null;
  isPublic: boolean;
  participants: string[];
  claimedBy: string[];
  createdAt: string;
}

export interface CreateGeoHuntPayload {
  title: string;
  landmarkName: string;
  loreHint: string;
  creatorWallet: string;
  huntEscrowPubkey: string;
  fundingTxSignature: string;
  tokenSymbol: GeoDropTokenSymbol;
  totalPoolAmount: number;
  totalChests: number;
  targetLat: number;
  targetLng: number;
  radiusMeters: GeoDropRadiusMeters;
  geofencePolygon?: GeoCoordinate[] | null;
  isPublic?: boolean;
}

export interface VerifyGeoDropClaimRequest {
  hunterPubkey: string;
  lat: number;
  lng: number;
  accuracy: number;
  indoorSimulation?: boolean;
}

export interface VerifyGeoDropClaimResponse {
  serializedTx: string;
  oracleSignature: string;
  oraclePublicKeyHex: string;
  distanceMeters: number;
  insideGeofence: boolean;
  rewardPerChest: number;
  tokenSymbol: GeoDropTokenSymbol;
  huntEscrowPubkey: string;
  indoorSimulation: boolean;
}

export interface ConfirmGeoDropClaimResponse {
  hunt: GeoHuntRecord;
  claimTxSignature: string;
  explorerUrl: string;
  solscanUrl: string;
}
