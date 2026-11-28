import fs from 'node:fs';
import path from 'node:path';
import { PublicKey } from '@solana/web3.js';

export interface UserProfileRecord {
  walletPubkey: string;
  username: string;
  normalizedUsername: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'usernames.json');

const USERNAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,23}$/;
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'actake',
  'support',
  'system',
  'root',
  'moderator',
  'official',
  'treasury',
  'escrow',
]);

let loaded = false;
const profilesByWallet = new Map<string, UserProfileRecord>();
const walletByNormalizedUsername = new Map<string, string>();

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(PROFILES_FILE)) return;
    const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as UserProfileRecord[];
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (item && typeof item.walletPubkey === 'string' && typeof item.username === 'string') {
        const normalized = normalizeUsername(item.username);
        profilesByWallet.set(item.walletPubkey, {
          ...item,
          normalizedUsername: normalized,
        });
        walletByNormalizedUsername.set(normalized, item.walletPubkey);
      }
    }
  } catch {
    // Start with an empty in-memory registry if disk is read-only or file does not exist yet
  }
}

function persistProfiles(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const records = Array.from(profilesByWallet.values());
    const tmpFile = `${PROFILES_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(records, null, 2), 'utf8');
    fs.renameSync(tmpFile, PROFILES_FILE);
  } catch {
    // Serverless / read-only filesystem fallback: keep in memory cleanly
  }
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function validateUsernameFormat(raw: string): {
  valid: boolean;
  displayUsername: string;
  normalized: string;
  reason?: string;
} {
  const cleaned = raw.trim().replace(/^@+/, '');
  const normalized = cleaned.toLowerCase();
  if (cleaned.length < 2) {
    return {
      valid: false,
      displayUsername: cleaned,
      normalized,
      reason: 'Username must be at least 2 characters.',
    };
  }
  if (cleaned.length > 24) {
    return {
      valid: false,
      displayUsername: cleaned,
      normalized,
      reason: 'Username must be 24 characters or fewer.',
    };
  }
  if (!USERNAME_REGEX.test(cleaned)) {
    return {
      valid: false,
      displayUsername: cleaned,
      normalized,
      reason: 'Start with a letter or number and use only letters, numbers, _, ., or -.',
    };
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return {
      valid: false,
      displayUsername: cleaned,
      normalized,
      reason: 'That username is reserved. Please pick another.',
    };
  }
  return { valid: true, displayUsername: cleaned, normalized };
}

export function getUserProfileByWallet(walletPubkey: string): UserProfileRecord | null {
  ensureLoaded();
  return profilesByWallet.get(walletPubkey.trim()) || null;
}

export function checkUsernameAvailability(
  rawUsername: string,
  walletPubkey?: string
): {
  available: boolean;
  username: string;
  normalized: string;
  reason?: string;
} {
  ensureLoaded();
  const validation = validateUsernameFormat(rawUsername);
  if (!validation.valid) {
    return {
      available: false,
      username: validation.displayUsername,
      normalized: validation.normalized,
      reason: validation.reason,
    };
  }

  const existingOwner = walletByNormalizedUsername.get(validation.normalized);
  if (existingOwner && existingOwner !== walletPubkey?.trim()) {
    return {
      available: false,
      username: validation.displayUsername,
      normalized: validation.normalized,
      reason: 'That username is already taken. Try another one.',
    };
  }

  return {
    available: true,
    username: validation.displayUsername,
    normalized: validation.normalized,
  };
}

export function claimOrUpdateUsername(params: {
  walletPubkey: string;
  username: string;
}): UserProfileRecord {
  ensureLoaded();
  const wallet = params.walletPubkey.trim();
  try {
    new PublicKey(wallet);
  } catch {
    throw new Error('Invalid Solana wallet address.');
  }

  const check = checkUsernameAvailability(params.username, wallet);
  if (!check.available) {
    throw new Error(check.reason || 'Username is unavailable.');
  }

  const existing = profilesByWallet.get(wallet);
  if (existing && existing.normalizedUsername !== check.normalized) {
    walletByNormalizedUsername.delete(existing.normalizedUsername);
  }

  const nowIso = new Date().toISOString();
  const record: UserProfileRecord = {
    walletPubkey: wallet,
    username: check.username,
    normalizedUsername: check.normalized,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  profilesByWallet.set(wallet, record);
  walletByNormalizedUsername.set(check.normalized, wallet);
  persistProfiles();
  return record;
}

export function listUserProfilesMap(wallets: string[]): Record<string, string> {
  ensureLoaded();
  const out: Record<string, string> = {};
  for (const w of wallets) {
    const rec = profilesByWallet.get(w.trim());
    if (rec) out[w.trim()] = rec.username;
  }
  return out;
}
