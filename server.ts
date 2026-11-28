import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  checkSupabaseHealth,
  computePoolSettlementQuote,
  createPoolRecord,
  getLiveGlobalActivity,
  getPoolById,
  getPoolsTractionMap,
  getSquadFeedAndLeaderboard,
  getTreasurySummary,
  isSupabaseActive,
  joinPoolRecord,
  listPools,
  reactToCheckin,
  recordPersonalSlash,
  recordPoolSettlement,
  recordVerifiedCheckin,
  resolvePoolByIdentifier,
} from './src/server/supabaseStore.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Deterministic Ed25519 Oracle Keypair (uses ORACLE_PRIVATE_KEY_HEX when provided in env,
// or safely generates a fresh Ed25519 keypair in memory for dev/preview).
function loadOracleKeypair(): {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  publicKeyHex: string;
  publicKeyBase58: string;
  persistentKey: boolean;
} {
  const seedHex = process.env.ORACLE_PRIVATE_KEY_HEX?.trim();
  if (seedHex && /^[0-9a-fA-F]{64}$/.test(seedHex)) {
    const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8Der = Buffer.concat([pkcs8Prefix, Buffer.from(seedHex, 'hex')]);
    const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
    const publicKey = crypto.createPublicKey(privateKey);
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const rawPub = Buffer.from(spkiDer).subarray(-32);
    return {
      privateKey,
      publicKey,
      publicKeyHex: rawPub.toString('hex'),
      publicKeyBase58: bs58.encode(rawPub),
      persistentKey: true,
    };
  }

  const generated = crypto.generateKeyPairSync('ed25519');
  const spkiDer = generated.publicKey.export({ type: 'spki', format: 'der' });
  const rawPub = Buffer.from(spkiDer).subarray(-32);
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    publicKeyHex: rawPub.toString('hex'),
    publicKeyBase58: bs58.encode(rawPub),
    persistentKey: false,
  };
}

const oracleKeys = loadOracleKeypair();
const airdropCooldownMap = new Map<string, number>();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function safeParseModelJson<T = Record<string, unknown>>(rawText: string | undefined): T {
  const original = String(rawText ?? '').trim();
  if (!original) {
    throw new Error('AI Vision returned an empty response. Please retake your photo and try again.');
  }

  // Strip optional markdown code fences (```json ... ``` or ``` ... ```)
  const unfenced = original
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(unfenced) as T;
  } catch {
    // Fallback: extract the first complete JSON object block if extra text surrounded it
    const firstBrace = unfenced.indexOf('{');
    const lastBrace = unfenced.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const slice = unfenced.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(slice) as T;
      } catch {
        // fall through to clean error
      }
    }
    throw new Error(
      'AI Vision returned a malformed response while inspecting the photo. Please retry or retake.'
    );
  }
}

function formatGeminiApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Vision verification failed.');
  if (/GEMINI_API_KEY is not configured|API_KEY_INVALID|PERMISSION_DENIED|403/i.test(raw)) {
    return 'AI Vision API key is missing or invalid. Please check your key in Settings > Secrets.';
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(raw)) {
    return 'AI Vision quota or rate limit reached. Please wait a few seconds and try again.';
  }
  if (/Unexpected token|JSON/i.test(raw)) {
    return 'AI Vision returned an unexpected format while cross-checking the photo. Please retry.';
  }
  return raw;
}

function to32BytePubkeyBuffer(value: string): Buffer {
  try {
    return Buffer.from(new PublicKey(value).toBytes());
  } catch {
    return crypto.createHash('sha256').update(value || 'actake_default').digest();
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applySolanaActionsCors(res: express.Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids'
  );
  res.setHeader('Access-Control-Expose-Headers', 'X-Action-Version, X-Blockchain-Ids');
  res.setHeader('X-Action-Version', '2.1.3');
  res.setHeader('X-Blockchain-Ids', 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
}

async function fetchLatestDevnetBlockhashServer(): Promise<string> {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const upstream = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getLatestBlockhash',
      params: [{ commitment: 'confirmed' }],
    }),
  });
  const data = (await upstream.json()) as { result?: { value?: { blockhash?: string } } };
  const blockhash = data?.result?.value?.blockhash;
  if (!blockhash) {
    throw new Error('Unable to fetch latest Solana Devnet blockhash.');
  }
  return blockhash;
}

interface ChallengeTemplate {
  itemName: string;
  categoryIds: string[];
  kind: 'object' | 'action';
  visualCue: string;
  antiCheatRule: string;
  accentHex: string;
  iconKey: string;
}

const OBJECT_POOL: ChallengeTemplate[] = [
  // ---- Morning Wakeup (everyday relatable home items) ----
  {
    itemName: 'Coffee Mug or Tea Cup',
    categoryIds: ['morning_wakeup', 'hydration_kitchen', 'reading_study'],
    kind: 'object',
    visualCue:
      'Frame a ceramic mug or tea cup on a counter or table with the handle and rim clearly visible in room light.',
    antiCheatRule: 'Must be a real 3D mug in physical space—screenshots or screen reflections are rejected.',
    accentHex: '#E86F48',
    iconKey: 'mug',
  },
  {
    itemName: 'Full Glass of Water',
    categoryIds: ['morning_wakeup', 'hydration_kitchen'],
    kind: 'object',
    visualCue:
      'Hold or place a clear glass filled with fresh drinking water on a counter in bright lighting.',
    antiCheatRule: 'Live physical glass with natural reflections required—no printed labels or screens.',
    accentHex: '#0284C7',
    iconKey: 'bottle',
  },
  {
    itemName: 'Bathroom Sink & Faucet',
    categoryIds: ['morning_wakeup'],
    kind: 'object',
    visualCue:
      'Walk to the bathroom and snap the physical sink basin and metal faucet in clear bright light.',
    antiCheatRule: 'Must capture a real 3D bathroom sink—no photos from a bed or phone screens.',
    accentHex: '#0EA5E9',
    iconKey: 'faucet',
  },
  {
    itemName: 'Opened Window or Curtains',
    categoryIds: ['morning_wakeup', 'make_bed'],
    kind: 'object',
    visualCue:
      'Pull open your curtains or blinds and snap your window showing natural morning light outside.',
    antiCheatRule: 'Real window frame and outdoor light depth required—no wallpapers or monitors.',
    accentHex: '#F59E0B',
    iconKey: 'window',
  },
  {
    itemName: 'Slippers or Pair of Socks',
    categoryIds: ['morning_wakeup', 'make_bed'],
    kind: 'object',
    visualCue:
      'Point your camera down at your house slippers or a real pair of socks on the floor away from bed.',
    antiCheatRule: 'Real fabric texture and floor perspective required—no online store photos.',
    accentHex: '#8B5CF6',
    iconKey: 'sneaker',
  },
  {
    itemName: 'Bath or Hand Towel',
    categoryIds: ['morning_wakeup', 'gym_fitness'],
    kind: 'object',
    visualCue:
      'Frame a hanging bath towel, hand towel, or folded gym towel showing real fabric folds and texture.',
    antiCheatRule: 'Live 3D towel texture required—no flat screens or stock photos.',
    accentHex: '#14B8A6',
    iconKey: 'towel',
  },
  {
    itemName: 'House Keys or Keychain',
    categoryIds: ['morning_wakeup', 'outdoors_grass', 'gym_fitness'],
    kind: 'object',
    visualCue:
      'Hold your metal house or car keys in your hand or set them on an entry table in clear light.',
    antiCheatRule: 'Real metallic highlights and physical shadows required—no photos of photos.',
    accentHex: '#D97706',
    iconKey: 'keys',
  },
  {
    itemName: 'Toothbrush',
    categoryIds: ['morning_wakeup'],
    kind: 'object',
    visualCue:
      'Hold your toothbrush upright next to a sink or glass in bright lighting so bristles and handle are clear.',
    antiCheatRule: 'Must be a real 3D physical toothbrush captured live—no phone screens or stock photos.',
    accentHex: '#2563EB',
    iconKey: 'toothbrush',
  },
  {
    itemName: 'Hairbrush or Comb',
    categoryIds: ['morning_wakeup'],
    kind: 'object',
    visualCue:
      'Hold a hairbrush or comb clearly in front of the camera in well-lit room lighting.',
    antiCheatRule: 'Physical bristles/teeth and real hand/surface depth required—no screen captures.',
    accentHex: '#EC4899',
    iconKey: 'generic',
  },
  {
    itemName: 'Soap Bottle or Face Wash',
    categoryIds: ['morning_wakeup'],
    kind: 'object',
    visualCue:
      'Capture a physical hand soap pump, cleanser, or face wash bottle standing on the bathroom counter.',
    antiCheatRule: 'Live 3D bathroom counter scene required—no product images on a monitor.',
    accentHex: '#06B6D4',
    iconKey: 'bottle',
  },
  {
    itemName: 'Breakfast Bowl or Plate',
    categoryIds: ['morning_wakeup', 'hydration_kitchen'],
    kind: 'object',
    visualCue:
      'Snap a ceramic breakfast bowl, plate, or morning snack on your kitchen counter or dining table.',
    antiCheatRule: 'Must show real kitchen lighting and 3D depth—no food photos on screens.',
    accentHex: '#EA580C',
    iconKey: 'utensil',
  },
  {
    itemName: 'Wristwatch or Wall Clock',
    categoryIds: ['morning_wakeup', 'reading_study'],
    kind: 'object',
    visualCue:
      'Point the camera at a physical wristwatch, desk clock, or wall clock in clear focus.',
    antiCheatRule: 'Real physical timepiece required—do not photograph another phone lockscreen.',
    accentHex: '#334155',
    iconKey: 'watch',
  },
  {
    itemName: 'Made Bed Pillows',
    categoryIds: ['make_bed', 'morning_wakeup'],
    kind: 'object',
    visualCue:
      'Step back and capture your neatly arranged bed pillows with the duvet or blanket pulled straight.',
    antiCheatRule: 'Real bedroom environment required—must be captured fresh via live camera.',
    accentHex: '#4F46E5',
    iconKey: 'bed',
  },

  // ---- Gym, Fitness, Push-Ups & Squats (mix of exercises + relatable gym gear) ----
  {
    itemName: '10 Push-Ups (Plank Position)',
    categoryIds: ['gym_fitness', 'push_ups'],
    kind: 'action',
    visualCue:
      'Prop your phone or angle the camera to capture yourself in a full push-up / high-plank stance on the floor or mat.',
    antiCheatRule: 'Must show a live real-world workout pose—no fitness videos, mirrors of screens, or stock photos.',
    accentHex: '#E86F48',
    iconKey: 'pushups',
  },
  {
    itemName: '15 Bodyweight Squats (Squat Stance)',
    categoryIds: ['gym_fitness', 'squats'],
    kind: 'action',
    visualCue:
      'Capture yourself mid-squat or in an active squat stance in your room or gym floor with clear lighting.',
    antiCheatRule: 'Live 3D person in real room lighting required—no workout app screenshots.',
    accentHex: '#22C55E',
    iconKey: 'squats',
  },
  {
    itemName: '30-Second Forearm Plank',
    categoryIds: ['gym_fitness', 'push_ups'],
    kind: 'action',
    visualCue:
      'Drop into a forearm plank on the floor or exercise mat and capture a live frame proving you are down and working.',
    antiCheatRule: 'Real floor environment and physical depth required—no screen recordings or photos of monitors.',
    accentHex: '#141416',
    iconKey: 'pushups',
  },
  {
    itemName: 'Dumbbell or Kettlebell',
    categoryIds: ['gym_fitness', 'push_ups', 'squats'],
    kind: 'object',
    visualCue:
      'Frame a real dumbbell, kettlebell, weight plate, or heavy training jug in your hand or on the floor.',
    antiCheatRule: 'Must show real 3D gym equipment in physical lighting—no catalog screenshots.',
    accentHex: '#141416',
    iconKey: 'dumbbell',
  },
  {
    itemName: 'Running Shoe or Gym Sneaker',
    categoryIds: ['gym_fitness', 'outdoors_grass', 'squats', 'morning_wakeup'],
    kind: 'object',
    visualCue:
      'Point the camera at a real athletic sneaker or training shoe showing laces and sole texture.',
    antiCheatRule: 'Live 3D shoe required in physical space—catalog photos on monitors will fail verification.',
    accentHex: '#22C55E',
    iconKey: 'sneaker',
  },
  {
    itemName: 'Workout Water Bottle or Shaker',
    categoryIds: ['gym_fitness', 'hydration_kitchen', 'outdoors_grass', 'push_ups', 'squats'],
    kind: 'object',
    visualCue:
      'Point your camera at a reusable gym water bottle or protein shaker cup with cap visible.',
    antiCheatRule: 'Live physical bottle required—no flat printed labels or digital screens.',
    accentHex: '#0284C7',
    iconKey: 'bottle',
  },
  {
    itemName: 'Yoga or Exercise Mat',
    categoryIds: ['gym_fitness', 'push_ups', 'squats'],
    kind: 'object',
    visualCue:
      'Unroll your yoga or workout mat on the floor and frame the textured mat surface in clear room lighting.',
    antiCheatRule: 'Real rolled-out mat on a physical floor required—no product photos on a screen.',
    accentHex: '#7C3AED',
    iconKey: 'mat',
  },
  {
    itemName: 'Resistance Band or Jump Rope',
    categoryIds: ['gym_fitness', 'push_ups', 'squats'],
    kind: 'object',
    visualCue:
      'Hold a resistance band, jump rope, or lifting straps clearly in natural light.',
    antiCheatRule: 'Must be real physical workout gear captured live—no digital images.',
    accentHex: '#F97316',
    iconKey: 'dumbbell',
  },
  {
    itemName: 'Gym Bag or Workout Gloves',
    categoryIds: ['gym_fitness'],
    kind: 'object',
    visualCue:
      'Snap your packed gym duffel bag, backpack, or lifting gloves ready for your training session.',
    antiCheatRule: 'Real physical fabric/zippers in ambient room lighting required.',
    accentHex: '#334155',
    iconKey: 'generic',
  },
  {
    itemName: 'Gym Machine, Bench, or Rack',
    categoryIds: ['gym_fitness'],
    kind: 'object',
    visualCue:
      'Point your camera at a weight bench, squat rack, pull-up bar, treadmill, or gym machine in front of you.',
    antiCheatRule: 'Must be captured live inside a real workout space—no gym photos on a monitor.',
    accentHex: '#181E25',
    iconKey: 'dumbbell',
  },
  {
    itemName: 'Wall Sit Hold (Active Stance)',
    categoryIds: ['gym_fitness', 'squats'],
    kind: 'action',
    visualCue:
      'Press your back flat against a wall in a 90-degree wall sit and capture your active stance live.',
    antiCheatRule: 'Real person against a real physical wall required—no stock fitness graphics.',
    accentHex: '#0EA5E9',
    iconKey: 'squats',
  },

  // ---- Make Bed ----
  {
    itemName: 'Folded Blanket or Straight Duvet',
    categoryIds: ['make_bed'],
    kind: 'object',
    visualCue:
      'Capture the foot and middle of your bed with the blanket neatly folded or smoothed flat.',
    antiCheatRule: 'Live bedroom lighting and fabric creases required—no catalog bedroom photos.',
    accentHex: '#6366F1',
    iconKey: 'bed',
  },
  {
    itemName: 'Clear Nightstand or Bedside Table',
    categoryIds: ['make_bed', 'morning_wakeup'],
    kind: 'object',
    visualCue:
      'Frame your tidy bedside table or nightstand next to your made bed in clear room lighting.',
    antiCheatRule: 'Real bedroom furniture depth required—no digital images.',
    accentHex: '#0F766E',
    iconKey: 'bed',
  },

  // ---- Reading & Study ----
  {
    itemName: 'Open Physical Book or Notebook',
    categoryIds: ['reading_study', 'morning_wakeup'],
    kind: 'object',
    visualCue:
      'Capture an open physical book or paper notebook showing visible pages and spine depth.',
    antiCheatRule: 'Paper texture and real ambient shadows must be visible—e-reader screenshots are blocked.',
    accentHex: '#7C3AED',
    iconKey: 'book',
  },
  {
    itemName: 'Pen or Highlighter on Paper',
    categoryIds: ['reading_study'],
    kind: 'object',
    visualCue:
      'Place a real pen, pencil, or highlighter resting on top of a notebook or printed study page.',
    antiCheatRule: 'Real physical stationery on paper required—no digital tablet note screenshots.',
    accentHex: '#2563EB',
    iconKey: 'pen',
  },
  {
    itemName: 'Desk Lamp or Study Workspace',
    categoryIds: ['reading_study'],
    kind: 'object',
    visualCue:
      'Frame your physical study desk with a lamp, notebook, or textbook ready for a focused session.',
    antiCheatRule: 'Live 3D workspace required—no stock desk setup images.',
    accentHex: '#D97706',
    iconKey: 'book',
  },
  {
    itemName: 'Handwritten To-Do List or Sticky Note',
    categoryIds: ['reading_study', 'morning_wakeup'],
    kind: 'object',
    visualCue:
      'Snap a physical sticky note or handwritten note with today’s task written on real paper.',
    antiCheatRule: 'Real ink/pencil on physical paper required—no digital notes app screens.',
    accentHex: '#F59E0B',
    iconKey: 'pen',
  },

  // ---- Touch Grass / Outdoors ----
  {
    itemName: 'Outdoor Grass or Plant Leaf',
    categoryIds: ['outdoors_grass'],
    kind: 'object',
    visualCue:
      'Point the camera closely at living green grass, outdoor foliage, or a real plant leaf.',
    antiCheatRule: 'Live organic leaf texture required—photos of monitors or wallpapers are rejected.',
    accentHex: '#16A34A',
    iconKey: 'leaf',
  },
  {
    itemName: 'Tree Bark or Outdoor Branch',
    categoryIds: ['outdoors_grass'],
    kind: 'object',
    visualCue:
      'Step outside and capture a real tree trunk, leafy branch, or outdoor shrub in natural daylight.',
    antiCheatRule: 'Real outdoor lighting and bark/leaf texture required—no nature screensavers.',
    accentHex: '#15803D',
    iconKey: 'leaf',
  },
  {
    itemName: 'Outdoor Sidewalk & Shoes',
    categoryIds: ['outdoors_grass'],
    kind: 'object',
    visualCue:
      'Step onto an outdoor sidewalk, porch, or park path and point your camera down at your shoes on the pavement.',
    antiCheatRule: 'Must be captured outdoors in real natural daylight—no indoor carpet or screen photos.',
    accentHex: '#059669',
    iconKey: 'sneaker',
  },
  {
    itemName: 'Sunglasses or Outdoor Cap',
    categoryIds: ['outdoors_grass'],
    kind: 'object',
    visualCue:
      'Hold a real pair of sunglasses, baseball cap, or outdoor jacket in bright natural light.',
    antiCheatRule: 'Live 3D item in natural lighting required—no product listings on screens.',
    accentHex: '#EA580C',
    iconKey: 'window',
  },

  // ---- Hydration & Kitchen ----
  {
    itemName: 'Spoon or Kitchen Fork',
    categoryIds: ['hydration_kitchen', 'morning_wakeup'],
    kind: 'object',
    visualCue:
      'Hold or place a clean metal spoon or fork on a kitchen counter in clear focus.',
    antiCheatRule: 'Live metallic reflection in a real room required—no screen captures.',
    accentHex: '#0F766E',
    iconKey: 'utensil',
  },
  {
    itemName: 'Fresh Piece of Fruit',
    categoryIds: ['hydration_kitchen', 'morning_wakeup'],
    kind: 'object',
    visualCue:
      'Hold or place a real piece of fruit (apple, banana, orange, etc.) on a table or counter in natural light.',
    antiCheatRule: 'Real 3D fruit texture and shadows required—no digital fruit photos.',
    accentHex: '#EF4444',
    iconKey: 'fruit',
  },
  {
    itemName: 'Kettle, Coffee Maker, or Pitcher',
    categoryIds: ['hydration_kitchen', 'morning_wakeup'],
    kind: 'object',
    visualCue:
      'Snap your kitchen kettle, coffee maker, or water pitcher sitting on the counter.',
    antiCheatRule: 'Real physical kitchen appliance in room lighting required—no catalog photos.',
    accentHex: '#B45309',
    iconKey: 'mug',
  },
];

// Keep track of recently drawn items per category so repeated triggers never get stuck on one item
const serverRecentByCategory = new Map<string, string[]>();

function recordServerDraw(categoryKey: string, itemName: string) {
  const prev = serverRecentByCategory.get(categoryKey) || [];
  const next = [itemName.toLowerCase(), ...prev.filter((x) => x !== itemName.toLowerCase())].slice(0, 10);
  serverRecentByCategory.set(categoryKey, next);
}

function getCategoryMatchedPool(categoryId: string, categoryName: string, environmentHint: string): ChallengeTemplate[] {
  const exact = OBJECT_POOL.filter((item) => item.categoryIds.includes(categoryId));
  if (exact.length > 0) return exact;

  const text = `${categoryId} ${categoryName} ${environmentHint}`.toLowerCase();
  if (/gym|workout|fit|lift|train|muscle|pushup|push-up|squat|exercise|run|cardio/.test(text)) {
    return OBJECT_POOL.filter((item) =>
      item.categoryIds.some((c) => ['gym_fitness', 'push_ups', 'squats'].includes(c))
    );
  }
  if (/wake|morning|alarm|sleep|bed|rise|routine/.test(text)) {
    return OBJECT_POOL.filter((item) =>
      item.categoryIds.some((c) => ['morning_wakeup', 'make_bed'].includes(c))
    );
  }
  if (/study|read|book|code|work|focus|desk|write/.test(text)) {
    return OBJECT_POOL.filter((item) => item.categoryIds.includes('reading_study'));
  }
  if (/grass|outside|outdoor|walk|park|nature|sun/.test(text)) {
    return OBJECT_POOL.filter((item) => item.categoryIds.includes('outdoors_grass'));
  }
  if (/water|hydrat|kitchen|cook|eat|breakfast|coffee|drink/.test(text)) {
    return OBJECT_POOL.filter((item) => item.categoryIds.includes('hydration_kitchen'));
  }
  return OBJECT_POOL;
}

function pickRandomElement<T>(items: T[]): T {
  const idx = crypto.randomInt(0, items.length);
  return items[idx];
}

function buildStudioReferenceSvg(itemName: string, accentHex: string, iconKey: string): string {
  const safeName = itemName.replace(/[<>&"]/g, '');
  let illustration = '';

  switch (iconKey) {
    case 'toothbrush':
      illustration = `
        <g transform="translate(200, 145) rotate(-32)">
          <rect x="-14" y="-88" width="28" height="176" rx="14" fill="#FFFFFF" stroke="#141416" stroke-width="5"/>
          <rect x="-8" y="-30" width="16" height="92" rx="8" fill="${accentHex}" opacity="0.9"/>
          <rect x="-12" y="-82" width="24" height="34" rx="6" fill="#E0F2FE" stroke="#141416" stroke-width="3"/>
          <line x1="-8" y1="-74" x2="8" y2="-74" stroke="${accentHex}" stroke-width="4" stroke-linecap="round"/>
          <line x1="-8" y1="-64" x2="8" y2="-64" stroke="${accentHex}" stroke-width="4" stroke-linecap="round"/>
          <line x1="-8" y1="-54" x2="8" y2="-54" stroke="#22C55E" stroke-width="4" stroke-linecap="round"/>
        </g>`;
      break;
    case 'mug':
      illustration = `
        <g transform="translate(195, 150)">
          <path d="M52 -36 C86 -36 86 24 52 24" fill="none" stroke="#141416" stroke-width="10" stroke-linecap="round"/>
          <rect x="-56" y="-56" width="108" height="114" rx="18" fill="#FFFFFF" stroke="#141416" stroke-width="5"/>
          <rect x="-46" y="-12" width="88" height="44" rx="8" fill="${accentHex}" opacity="0.88"/>
          <ellipse cx="-2" cy="-56" rx="52" ry="12" fill="#F7F7F9" stroke="#141416" stroke-width="5"/>
          <path d="M-22 -84 Q-14 -100 -22 -114 M6 -84 Q14 -100 6 -114" fill="none" stroke="#8E8E93" stroke-width="4" stroke-linecap="round"/>
        </g>`;
      break;
    case 'sneaker':
      illustration = `
        <g transform="translate(200, 160)">
          <path d="M-86 24 L-74 -34 L-26 -30 L8 -6 L72 6 C88 10 92 28 84 38 L-84 38 C-92 38 -92 28 -86 24 Z" fill="#FFFFFF" stroke="#141416" stroke-width="5" stroke-linejoin="round"/>
          <path d="M-86 26 L86 26 L82 40 L-82 40 Z" fill="${accentHex}"/>
          <line x1="-18" y1="-22" x2="-4" y2="-10" stroke="#141416" stroke-width="4" stroke-linecap="round"/>
          <line x1="-4" y1="-16" x2="10" y2="-4" stroke="#141416" stroke-width="4" stroke-linecap="round"/>
        </g>`;
      break;
    case 'book':
      illustration = `
        <g transform="translate(200, 152)">
          <path d="M-84 -44 C-46 -56 -14 -46 0 -30 C14 -46 46 -56 84 -44 L84 44 C46 32 14 42 0 54 C-14 42 -46 32 -84 44 Z" fill="#FFFFFF" stroke="#141416" stroke-width="5" stroke-linejoin="round"/>
          <line x1="0" y1="-30" x2="0" y2="54" stroke="#141416" stroke-width="4"/>
          <line x1="-64" y1="-16" x2="-18" y2="-10" stroke="${accentHex}" stroke-width="4" stroke-linecap="round"/>
          <line x1="-64" y1="2" x2="-18" y2="8" stroke="#8E8E93" stroke-width="4" stroke-linecap="round"/>
        </g>`;
      break;
    case 'bottle':
      illustration = `
        <g transform="translate(200, 152)">
          <rect x="-18" y="-82" width="36" height="20" rx="5" fill="#141416"/>
          <path d="M-24 -62 L24 -62 L38 -36 L38 66 C38 78 28 84 18 84 L-18 84 C-28 84 -38 78 -38 66 L-38 -36 Z" fill="#FFFFFF" stroke="#141416" stroke-width="5"/>
          <rect x="-32" y="-12" width="64" height="58" rx="8" fill="${accentHex}" opacity="0.85"/>
        </g>`;
      break;
    case 'dumbbell':
      illustration = `
        <g transform="translate(200, 152) rotate(-18)">
          <rect x="-56" y="-8" width="112" height="16" rx="6" fill="#CBD5E1" stroke="#141416" stroke-width="4"/>
          <rect x="-82" y="-44" width="24" height="88" rx="10" fill="#141416"/>
          <rect x="-58" y="-32" width="16" height="64" rx="6" fill="${accentHex}"/>
          <rect x="58" y="-44" width="24" height="88" rx="10" fill="#141416"/>
          <rect x="42" y="-32" width="16" height="64" rx="6" fill="${accentHex}"/>
        </g>`;
      break;
    case 'pushups':
      illustration = `
        <g transform="translate(200, 156)">
          <line x1="-100" y1="42" x2="100" y2="42" stroke="#CBD5E1" stroke-width="6" stroke-linecap="round"/>
          <circle cx="60" cy="-26" r="16" fill="${accentHex}" stroke="#141416" stroke-width="4"/>
          <line x1="42" y1="-16" x2="-68" y2="28" stroke="#141416" stroke-width="11" stroke-linecap="round"/>
          <line x1="34" y1="-12" x2="46" y2="38" stroke="#141416" stroke-width="9" stroke-linecap="round"/>
          <line x1="-68" y1="28" x2="-82" y2="40" stroke="#141416" stroke-width="9" stroke-linecap="round"/>
          <path d="M-6 -46 L-6 -20 M-16 -30 L-6 -20 L4 -30" fill="none" stroke="${accentHex}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </g>`;
      break;
    case 'squats':
      illustration = `
        <g transform="translate(200, 152)">
          <line x1="-88" y1="54" x2="88" y2="54" stroke="#CBD5E1" stroke-width="6" stroke-linecap="round"/>
          <circle cx="8" cy="-58" r="16" fill="${accentHex}" stroke="#141416" stroke-width="4"/>
          <path d="M4 -40 L-16 -2 L24 10 L18 50" fill="none" stroke="#141416" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M-2 -30 L42 -20" fill="none" stroke="#141416" stroke-width="8" stroke-linecap="round"/>
          <path d="M-16 -2 L-46 18 L-34 50" fill="none" stroke="#141416" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        </g>`;
      break;
    case 'mat':
      illustration = `
        <g transform="translate(200, 154)">
          <polygon points="-96,24 -42,-36 96,-36 42,24" fill="${accentHex}" opacity="0.88" stroke="#141416" stroke-width="5" stroke-linejoin="round"/>
          <ellipse cx="-68" cy="12" rx="16" ry="28" fill="#FFFFFF" stroke="#141416" stroke-width="5"/>
          <ellipse cx="-68" cy="12" rx="6" ry="12" fill="${accentHex}"/>
        </g>`;
      break;
    case 'faucet':
      illustration = `
        <g transform="translate(200, 154)">
          <path d="M-46 28 L-46 -32 C-46 -64 26 -64 26 -24 L26 -8" fill="none" stroke="#141416" stroke-width="12" stroke-linecap="round"/>
          <rect x="-78" y="24" width="156" height="22" rx="10" fill="#FFFFFF" stroke="#141416" stroke-width="5"/>
          <path d="M26 8 C38 22 38 36 26 36 C14 36 14 22 26 8 Z" fill="${accentHex}"/>
        </g>`;
      break;
    case 'window':
      illustration = `
        <g transform="translate(200, 148)">
          <rect x="-68" y="-62" width="136" height="124" rx="14" fill="#E0F2FE" stroke="#141416" stroke-width="5"/>
          <circle cx="24" cy="-24" r="18" fill="${accentHex}"/>
          <line x1="0" y1="-62" x2="0" y2="62" stroke="#141416" stroke-width="5"/>
          <line x1="-68" y1="0" x2="68" y2="0" stroke="#141416" stroke-width="5"/>
        </g>`;
      break;
    case 'towel':
      illustration = `
        <g transform="translate(200, 150)">
          <line x1="-82" y1="-54" x2="82" y2="-54" stroke="#141416" stroke-width="7" stroke-linecap="round"/>
          <rect x="-46" y="-54" width="92" height="114" rx="12" fill="${accentHex}" opacity="0.9" stroke="#141416" stroke-width="5"/>
          <line x1="-36" y1="30" x2="36" y2="30" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
          <line x1="-36" y1="44" x2="36" y2="44" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
        </g>`;
      break;
    case 'watch':
      illustration = `
        <g transform="translate(200, 150)">
          <rect x="-24" y="-82" width="48" height="164" rx="14" fill="#141416"/>
          <circle cx="0" cy="0" r="46" fill="#FFFFFF" stroke="#141416" stroke-width="6"/>
          <line x1="0" y1="0" x2="0" y2="-24" stroke="#141416" stroke-width="5" stroke-linecap="round"/>
          <line x1="0" y1="0" x2="20" y2="8" stroke="${accentHex}" stroke-width="5" stroke-linecap="round"/>
          <circle cx="0" cy="0" r="5" fill="#141416"/>
        </g>`;
      break;
    case 'pen':
      illustration = `
        <g transform="translate(200, 150) rotate(-32)">
          <rect x="-12" y="-76" width="24" height="128" rx="8" fill="${accentHex}" stroke="#141416" stroke-width="5"/>
          <polygon points="-12,52 12,52 0,82" fill="#FFFFFF" stroke="#141416" stroke-width="5" stroke-linejoin="round"/>
          <circle cx="0" cy="74" r="4" fill="#141416"/>
        </g>`;
      break;
    case 'fruit':
      illustration = `
        <g transform="translate(200, 156)">
          <path d="M0 -42 C32 -52 56 -22 48 16 C42 46 18 58 0 48 C-18 58 -42 46 -48 16 C-56 -22 -32 -52 0 -42 Z" fill="${accentHex}" stroke="#141416" stroke-width="5"/>
          <path d="M0 -42 C4 -64 20 -72 34 -68 C26 -50 12 -44 0 -42 Z" fill="#22C55E" stroke="#141416" stroke-width="4"/>
        </g>`;
      break;
    case 'utensil':
      illustration = `
        <g transform="translate(200, 150) rotate(-25)">
          <ellipse cx="0" cy="-46" rx="22" ry="34" fill="#E2E8F0" stroke="#141416" stroke-width="5"/>
          <rect x="-7" y="-12" width="14" height="92" rx="7" fill="${accentHex}" stroke="#141416" stroke-width="4"/>
        </g>`;
      break;
    case 'leaf':
      illustration = `
        <g transform="translate(200, 152)">
          <path d="M-64 46 C-62 -24 -12 -74 68 -70 C70 10 24 62 -46 58 Z" fill="${accentHex}" stroke="#141416" stroke-width="5" stroke-linejoin="round"/>
          <path d="M-72 64 C-32 24 10 -14 52 -52" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
        </g>`;
      break;
    case 'bed':
      illustration = `
        <g transform="translate(200, 156)">
          <rect x="-86" y="-48" width="172" height="56" rx="12" fill="#E2E8F0" stroke="#141416" stroke-width="5"/>
          <rect x="-70" y="-36" width="60" height="32" rx="10" fill="#FFFFFF" stroke="#141416" stroke-width="4"/>
          <rect x="10" y="-36" width="60" height="32" rx="10" fill="#FFFFFF" stroke="#141416" stroke-width="4"/>
          <rect x="-92" y="-2" width="184" height="56" rx="14" fill="${accentHex}" stroke="#141416" stroke-width="5"/>
        </g>`;
      break;
    case 'keys':
      illustration = `
        <g transform="translate(200, 150)">
          <circle cx="-36" cy="-18" r="32" fill="none" stroke="#141416" stroke-width="8"/>
          <circle cx="-36" cy="-18" r="14" fill="${accentHex}"/>
          <path d="M-4 -18 L82 -18 L82 4 L64 4 L64 -4 L48 -4 L48 8 L32 8 L32 -6 L-4 -6 Z" fill="#E2E8F0" stroke="#141416" stroke-width="5" stroke-linejoin="round"/>
        </g>`;
      break;
    default:
      illustration = `
        <g transform="translate(200, 150)">
          <circle cx="0" cy="0" r="64" fill="#FFFFFF" stroke="#141416" stroke-width="5"/>
          <circle cx="0" cy="0" r="38" fill="${accentHex}" opacity="0.9"/>
          <path d="M-16 2 L-4 14 L20 -14" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        </g>`;
      break;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <defs>
      <radialGradient id="studioBg" cx="50%" cy="42%" r="65%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="#F1F2F6"/>
      </radialGradient>
    </defs>
    <rect width="400" height="300" rx="24" fill="url(#studioBg)"/>
    ${illustration}
    <text x="200" y="274" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#111114" letter-spacing="0.04em">${safeName.toUpperCase()}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function runVisionOracleVerification(params: {
  poolPubkey: string;
  userPubkey: string;
  dayIndex: number;
  missionType: string;
  targetPrompt: string;
  visualCue?: string;
  antiCheatRule?: string;
  imageBase64: string;
  mimeType: string;
  poolId?: string;
  memberName?: string;
  gps?: {
    lat: number;
    lng: number;
    accuracy: number;
    mocked?: boolean;
    targetLat?: number;
    targetLng?: number;
    radiusMeters?: number;
  };
}) {
  // Enforce GPS anti-cheat rules for GPS_HUNT missions
  if (params.missionType === 'GPS_HUNT' && params.gps) {
    if (params.gps.mocked === true) {
      throw new Error('Mocked GPS location detected. Hardware GPS is required.');
    }
    if (typeof params.gps.accuracy === 'number' && params.gps.accuracy > 50) {
      throw new Error(`GPS accuracy too low (${Math.round(params.gps.accuracy)}m). Must be <= 50m.`);
    }
    if (
      typeof params.gps.targetLat === 'number' &&
      typeof params.gps.targetLng === 'number' &&
      typeof params.gps.radiusMeters === 'number'
    ) {
      const dist = haversineMeters(
        params.gps.lat,
        params.gps.lng,
        params.gps.targetLat,
        params.gps.targetLng
      );
      if (dist > params.gps.radiusMeters) {
        throw new Error(
          `Outside target geofence (${Math.round(dist)}m away; must be within ${params.gps.radiusMeters}m).`
        );
      }
    }
  }

  const rawInput = String(params.imageBase64 || '').trim();
  const dataUrlMatch = rawInput.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/i);
  const resolvedMimeType =
    dataUrlMatch?.[1]?.toLowerCase() ||
    (params.mimeType && /^image\//i.test(params.mimeType) ? params.mimeType : 'image/jpeg');
  const cleanedBase64 = rawInput.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '').trim();

  const photoBuffer = Buffer.from(cleanedBase64, 'base64');
  if (photoBuffer.length < 100 || photoBuffer.length > 10 * 1024 * 1024) {
    throw new Error('Invalid image payload size. Please retake your photo.');
  }

  const proofHashBuf = crypto.createHash('sha256').update(photoBuffer).digest();
  const proofHashHex = proofHashBuf.toString('hex');

  const ai = getGeminiClient();

  let parsed: {
    verified?: unknown;
    liveConfirmed?: unknown;
    confidence?: unknown;
    detectedObject?: unknown;
    reasoning?: unknown;
  } | null = null;
  let lastVisionErr: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: resolvedMimeType,
                data: cleanedBase64,
              },
            },
            {
              text: `You are the Actake Anti-Cheat Vision Oracle verifying a live habit proof photo.
Mission Type: "${params.missionType}"
Target item/action required: "${params.targetPrompt}"
Capture instructions given to user: "${params.visualCue || 'Show the physical item or action clearly.'}"
Anti-cheat rule: "${params.antiCheatRule || 'Reject photos of phone/laptop screens, printed photos, or unrelated items.'}"

Evaluate the live camera photo strictly:
1. Confirm this is a genuine live photograph taken in the physical 3D world (NOT a photo of a phone/laptop screen, monitor pixels, or printed picture).
2. Confirm the target object/action ("${params.targetPrompt}") is clearly visible.
3. Provide a confidence score between 0.0 and 1.0. Only set verified=true if the target matches AND liveConfirmed=true AND confidence >= 0.80.
Return ONLY valid JSON matching the schema.`,
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verified: { type: Type.BOOLEAN },
              liveConfirmed: { type: Type.BOOLEAN },
              confidence: { type: Type.NUMBER },
              detectedObject: { type: Type.STRING },
              reasoning: { type: Type.STRING },
            },
            required: ['verified', 'liveConfirmed', 'confidence', 'detectedObject', 'reasoning'],
          },
        },
      });

      parsed = safeParseModelJson(response.text);
      if (parsed && typeof parsed === 'object') {
        break;
      }
      throw new Error('Vision model returned an empty or unreadable JSON response.');
    } catch (err) {
      lastVisionErr = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isPermanentKeyError = /API_KEY_INVALID|PERMISSION_DENIED|GEMINI_API_KEY is not configured|403/i.test(
        errMsg
      );
      if (isPermanentKeyError || attempt === 1) {
        throw new Error(formatGeminiApiError(err));
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }

  if (!parsed) {
    throw new Error(formatGeminiApiError(lastVisionErr));
  }

  const rawConfidence = Number(parsed.confidence ?? 0);
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
  const liveConfirmed = Boolean(parsed.liveConfirmed);
  const verified = Boolean(parsed.verified) && liveConfirmed && confidence >= 0.8;

  // Deterministic PRD binary payload: pool_pubkey (32B) || user_pubkey (32B) || day_index (1B) || proof_hash (32B)
  const dayByte = Buffer.from([Number(params.dayIndex) & 0xff]);
  const binaryPayload = Buffer.concat([
    to32BytePubkeyBuffer(params.poolPubkey),
    to32BytePubkeyBuffer(params.userPubkey),
    dayByte,
    proofHashBuf,
  ]);

  const signatureBuf = crypto.sign(null, binaryPayload, oracleKeys.privateKey);
  const oracleSignatureHex = signatureBuf.toString('hex');
  const verifiedAt = Date.now();

  if (verified && params.poolId) {
    await recordVerifiedCheckin({
      poolId: params.poolId,
      userPubkey: params.userPubkey,
      memberName: params.memberName,
      dayIndex: params.dayIndex,
      missionType: params.missionType,
      targetPrompt: params.targetPrompt,
      confidence,
      reason: String(parsed.reasoning || 'Verified live physical capture.'),
      proofHash: proofHashHex,
      oracleSignature: oracleSignatureHex,
    });
  }

  return {
    verified,
    liveConfirmed,
    confidence,
    detectedObject: String(parsed.detectedObject || 'Unknown'),
    reasoning: String(parsed.reasoning || ''),
    reason: String(parsed.reasoning || ''),
    photoSha256: proofHashHex,
    proofHashHex,
    oracleSignature: oracleSignatureHex,
    oracleSignatureHex,
    oraclePublicKey: oracleKeys.publicKeyHex,
    oraclePubkey: oracleKeys.publicKeyHex,
    messageBytesHex: binaryPayload.toString('hex'),
    verifiedAt,
    model: 'gemini-4-hydrogen',
  };
}

function resolveBaseOrigin(req: express.Request): string {
  const envAppUrl = process.env.APP_URL?.trim();
  if (envAppUrl) {
    return envAppUrl.replace(/\/$/, '');
  }
  const vercelProdUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProdUrl) {
    return (
      vercelProdUrl.startsWith('http') ? vercelProdUrl : `https://${vercelProdUrl}`
    ).replace(/\/$/, '');
  }
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return (vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`).replace(/\/$/, '');
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .split(',')[0]
    .trim();
  const forwardedHost = String(
    req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`
  )
    .split(',')[0]
    .trim();
  return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, '');
}

function parseValidSolanaAddress(raw: string | undefined): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    return new PublicKey(trimmed).toBase58();
  } catch {
    return null;
  }
}

function resolveTreasuryConfig() {
  const customProgramId = process.env.VITE_ACTAKE_ESCROW_PROGRAM_ID?.trim() || '';
  const defaultProgramId = 'ACTKescrow111111111111111111111111111111111';
  let customAnchorDeployed = false;
  if (customProgramId && customProgramId !== defaultProgramId) {
    try {
      new PublicKey(customProgramId);
      customAnchorDeployed = true;
    } catch {
      customAnchorDeployed = false;
    }
  }

  const escrowWallet =
    parseValidSolanaAddress(process.env.ACTAKE_ESCROW_WALLET) ||
    parseValidSolanaAddress(process.env.VITE_ACTAKE_ESCROW_WALLET);
  const treasuryWallet =
    parseValidSolanaAddress(process.env.ACTAKE_TREASURY_WALLET) ||
    parseValidSolanaAddress(process.env.VITE_ACTAKE_TREASURY_WALLET);

  return {
    escrowWallet,
    treasuryWallet,
    escrowConfigured: Boolean(escrowWallet),
    treasuryConfigured: Boolean(treasuryWallet),
    pollarSafeForRealDeposits: customAnchorDeployed || Boolean(escrowWallet),
    usdcProtocolFeePct: 1.5,
    skrProtocolFeePct: 0,
    soloSlashRouting: '50_owner_50_treasury' as const,
  };
}

export function createApiApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      oraclePubkey: oracleKeys.publicKeyHex,
      supabaseConnected: isSupabaseActive(),
    });
  });

  // ============================================================================
  // SOLANA ACTIONS / BLINKS DISCOVERY & ENDPOINTS (@solana/actions spec)
  // ============================================================================
  app.options('/actions.json', (_req, res) => {
    applySolanaActionsCors(res);
    res.status(204).end();
  });

  app.get('/actions.json', (_req, res) => {
    applySolanaActionsCors(res);
    res.json({
      rules: [
        { pathPattern: '/squad/*', apiPath: '/api/actions/join/*' },
        { pathPattern: '/api/actions/join/*', apiPath: '/api/actions/join/*' },
      ],
    });
  });

  app.options('/api/actions/join/:poolId', (_req, res) => {
    applySolanaActionsCors(res);
    res.status(204).end();
  });

  app.get('/api/actions/join/:poolId', async (req, res) => {
    applySolanaActionsCors(res);
    try {
      const poolId = String(req.params.poolId || '').trim();
      const pool = (await resolvePoolByIdentifier(poolId)) || (await getPoolById(poolId)) || (await listPools(1))[0];
      const baseOrigin = resolveBaseOrigin(req);

      if (!pool) {
        res.status(404).json({ message: 'Pool not found' });
        return;
      }

      const period = pool.alarmHour >= 12 ? 'PM' : 'AM';
      const h12 = pool.alarmHour % 12 === 0 ? 12 : pool.alarmHour % 12;
      const deadlineLabel = `${String(h12).padStart(2, '0')}:${String(pool.alarmMinute).padStart(2, '0')} ${period}`;

      res.json({
        type: 'action',
        icon: `${baseOrigin}/assets/aistudio/image-removebg-preview__1__38d6ac67.png`,
        title: `Join ${pool.title} · $${pool.totalStaked} ${pool.tokenSymbol} Pot`,
        description: `Stake $${pool.stakeAmount} ${pool.tokenSymbol} to join ${pool.participantCount} members. Daily ${deadlineLabel} AI-verified check-in — missed alarms slash into the winners' split.`,
        label: `Stake $${pool.stakeAmount} ${pool.tokenSymbol} & Join Squad`,
        links: {
          actions: [
            {
              label: `Stake $${pool.stakeAmount} ${pool.tokenSymbol} & Join Squad`,
              href: `${baseOrigin}/api/actions/join/${encodeURIComponent(pool.id)}`,
            },
          ],
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load Solana Blink metadata.';
      res.status(500).json({ message: msg });
    }
  });

  app.post('/api/actions/join/:poolId', async (req, res) => {
    applySolanaActionsCors(res);
    try {
      const poolId = String(req.params.poolId || '').trim();
      const accountStr = String(req.body?.account || '').trim();
      if (!accountStr) {
        res.status(400).json({ message: 'Missing Solana account public key in request body.' });
        return;
      }

      let payer: PublicKey;
      try {
        payer = new PublicKey(accountStr);
      } catch {
        res.status(400).json({ message: 'Invalid Solana account public key.' });
        return;
      }

      const pool = (await resolvePoolByIdentifier(poolId)) || (await getPoolById(poolId)) || (await listPools(1))[0];
      if (!pool) {
        res.status(404).json({ message: 'Pool not found.' });
        return;
      }

      const recentBlockhash = await fetchLatestDevnetBlockhashServer();
      const tx = new Transaction({
        feePayer: payer,
        recentBlockhash: recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
      });

      tx.add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: payer,
          lamports: 0,
        })
      );

      const memoPayload = JSON.stringify({
        program: 'actake_escrow',
        ix: 'join_pool',
        poolId: pool.id,
        poolPubkey: pool.poolPubkey,
        token: pool.tokenSymbol,
        mint: pool.mint,
        stakeAmount: pool.stakeAmount,
        source: 'solana-blink',
      });

      tx.add(
        new TransactionInstruction({
          keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from(memoPayload, 'utf-8'),
        })
      );

      const serialized = await tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      res.json({
        type: 'transaction',
        transaction: Buffer.from(serialized).toString('base64'),
        message: `Locked $${pool.stakeAmount} ${pool.tokenSymbol} into ${pool.title} on Solana.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to build Blink transaction.';
      res.status(500).json({ message: msg });
    }
  });

  // ============================================================================
  // SUPABASE-BACKED POOLS, SQUAD FEEDS & GLOBAL ACTIVITY API
  // ============================================================================
  app.get('/api/activity/live', async (_req, res) => {
    try {
      const summary = await getLiveGlobalActivity();
      res.json(summary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch live activity.';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/pools', async (req, res) => {
    try {
      const typeParam = req.query.type;
      const poolType =
        typeParam !== undefined && typeParam !== '' ? Number(typeParam) : undefined;
      const pools = await listPools(poolType);
      res.json({ pools, storageMode: isSupabaseActive() ? 'supabase' : 'memory' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load pools.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/pools', async (req, res) => {
    try {
      const {
        id: rawId,
        inviteCode: rawInviteCode,
        title,
        poolPubkey,
        creatorPubkey,
        creatorName,
        categoryId,
        environmentHint,
        tokenSymbol = 'USDC',
        poolType = 1,
        stakeAmount = 10,
        totalDays = 7,
        alarmHour = 7,
        alarmMinute = 0,
        targetLat = null,
        targetLng = null,
        radiusMeters = 150,
        joinedTxSignature = '',
      } = req.body ?? {};

      const cleanTitle = String(title || '').trim();
      const cleanCreator = String(creatorPubkey || '').trim();
      const amountNum = Number(stakeAmount);
      const rawIdStr = typeof rawId === 'string' ? rawId.trim() : '';
      const cleanId = /^[a-zA-Z0-9_-]{3,80}$/.test(rawIdStr) ? rawIdStr : undefined;
      const rawCodeStr = typeof rawInviteCode === 'string' ? rawInviteCode.trim().toUpperCase() : '';
      const cleanInviteCode = /^[A-Z0-9-]{4,16}$/.test(rawCodeStr) ? rawCodeStr : undefined;

      if (!cleanTitle || cleanTitle.length > 80) {
        res.status(400).json({ error: 'Pool title must be between 1 and 80 characters.' });
        return;
      }
      if (!cleanCreator) {
        res.status(400).json({ error: 'creatorPubkey is required.' });
        return;
      }
      if (!Number.isFinite(amountNum) || amountNum < 1 || amountNum > 10000) {
        res.status(400).json({ error: 'stakeAmount must be between 1 and 10,000.' });
        return;
      }

      const pool = await createPoolRecord({
        id: cleanId,
        inviteCode: cleanInviteCode,
        title: cleanTitle,
        poolPubkey: String(poolPubkey || `ACTKPool${Date.now().toString(36)}`),
        creatorPubkey: cleanCreator,
        creatorName: creatorName ? String(creatorName).slice(0, 32) : undefined,
        categoryId: categoryId ? String(categoryId).slice(0, 48) : undefined,
        environmentHint: environmentHint ? String(environmentHint).slice(0, 240) : undefined,
        tokenSymbol: tokenSymbol === 'SKR' ? 'SKR' : 'USDC',
        poolType: poolType === 0 || poolType === 2 ? poolType : 1,
        stakeAmount: amountNum,
        totalDays: Math.max(1, Math.min(30, Number(totalDays) || 7)),
        alarmHour: Math.max(0, Math.min(23, Number(alarmHour) || 7)),
        alarmMinute: Math.max(0, Math.min(59, Number(alarmMinute) || 0)),
        targetLat: typeof targetLat === 'number' ? targetLat : null,
        targetLng: typeof targetLng === 'number' ? targetLng : null,
        radiusMeters: Math.max(25, Math.min(1000, Number(radiusMeters) || 150)),
        joinedTxSignature: String(joinedTxSignature || `join_${Date.now()}`),
      });

      res.status(201).json({ pool });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create pool.';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/pools/resolve', async (req, res) => {
    try {
      const rawQuery = String(req.query.q || '').trim();
      if (!rawQuery || rawQuery.length > 500) {
        res.status(400).json({ error: 'Provide a valid pool link, Blink URL, or invite code.' });
        return;
      }
      const pool = await resolvePoolByIdentifier(rawQuery);
      if (!pool) {
        res.status(404).json({ error: 'No matching accountability pool found for that link or code.' });
        return;
      }
      const result = await getSquadFeedAndLeaderboard(pool.id);
      if (!result.pool) {
        res.status(404).json({ error: 'Pool not found.' });
        return;
      }
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resolve pool link or code.';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/pools/traction', async (req, res) => {
    try {
      const rawIds = String(req.query.ids || '').trim();
      if (!rawIds) {
        res.json({ tractionByPoolId: {} });
        return;
      }
      const ids = rawIds
        .split(',')
        .map((id) => id.trim())
        .filter((id) => /^[a-zA-Z0-9_-]{3,80}$/.test(id))
        .slice(0, 25);
      const tractionByPoolId = await getPoolsTractionMap(ids);
      res.json({ tractionByPoolId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load pool traction.';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/pools/:poolId', async (req, res) => {
    try {
      const poolId = String(req.params.poolId || '').trim();
      const result = await getSquadFeedAndLeaderboard(poolId);
      if (!result.pool) {
        res.status(404).json({ error: 'Pool not found.' });
        return;
      }
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load pool lobby.';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/squads/:poolId/feed', async (req, res) => {
    try {
      const poolId = String(req.params.poolId || '').trim();
      const result = await getSquadFeedAndLeaderboard(poolId);
      if (!result.pool) {
        res.status(404).json({ error: 'Squad pool not found.' });
        return;
      }
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch squad feed.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/pools/:poolId/join', async (req, res) => {
    try {
      const poolId = String(req.params.poolId || '').trim();
      const userPubkey = String(req.body?.userPubkey || '').trim();
      const displayName = req.body?.displayName ? String(req.body.displayName).slice(0, 32) : undefined;
      const joinedTxSignature = String(req.body?.joinedTxSignature || `join_${Date.now()}`);

      if (!userPubkey) {
        res.status(400).json({ error: 'userPubkey is required to join pool.' });
        return;
      }

      const joined = await joinPoolRecord(poolId, {
        userPubkey,
        displayName,
        joinedTxSignature,
      });

      if (!joined) {
        res.status(404).json({ error: 'Pool not found.' });
        return;
      }
      res.json(joined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join pool.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/checkins/:checkinId/react', async (req, res) => {
    try {
      const checkinId = String(req.params.checkinId || '').trim();
      const kind = req.body?.kind === 'fire' ? 'fire' : 'like';
      const counts = await reactToCheckin(checkinId, kind);
      if (!counts) {
        res.status(404).json({ error: 'Check-in not found.' });
        return;
      }
      res.json(counts);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record reaction.';
      res.status(500).json({ error: msg });
    }
  });

  // ============================================================================
  // AI ANTI-CHEAT CHALLENGE & MULTIMODAL VISION ORACLE (Gemini 4 Hydrogen)
  // ============================================================================
  app.post('/api/ai/challenge', async (req, res) => {
    try {
      const {
        categoryId = 'morning_wakeup',
        categoryName = 'Morning Wakeup',
        environmentHint = 'Everyday home or routine objects',
        recentItems = [],
      } = req.body ?? {};

      const safeCatId = String(categoryId || 'morning_wakeup').trim();
      const safeCatName = String(categoryName || 'Morning Wakeup').trim();
      const safeHint = String(environmentHint || 'Everyday household objects or actions').trim();

      const serverRecent = serverRecentByCategory.get(safeCatId) || [];
      const clientRecent = Array.isArray(recentItems)
        ? recentItems.map((s: unknown) => String(s).toLowerCase().trim()).filter(Boolean)
        : [];
      const avoidSet = new Set<string>([...clientRecent, ...serverRecent]);
      const lastDrawn = serverRecent[0] || clientRecent[0] || '';

      const categoryPool = getCategoryMatchedPool(safeCatId, safeCatName, safeHint);
      let eligible = categoryPool.filter((item) => !avoidSet.has(item.itemName.toLowerCase()));
      if (eligible.length === 0) {
        // Everything in this category was recently used — allow pool again except the immediate previous draw
        eligible = categoryPool.filter((item) => item.itemName.toLowerCase() !== lastDrawn);
      }
      if (eligible.length === 0) {
        eligible = categoryPool;
      }

      // True cryptographic random pick on the server so we NEVER deterministically repeat "Toothbrush"
      const selectedTemplate = pickRandomElement(eligible);
      const isCustomCategory =
        safeCatId.startsWith('custom') ||
        !OBJECT_POOL.some((item) => item.categoryIds.includes(safeCatId));
      // 35% of the time (or 100% for custom categories), invite Gemini to invent a brand-new relatable
      // everyday item or exercise action; otherwise enrich our cryptographically random selected target.
      const shouldFreestyle = isCustomCategory || crypto.randomInt(0, 100) < 35;
      const randomSeed = crypto.randomBytes(6).toString('hex');

      let itemName = selectedTemplate.itemName;
      let visualCue = selectedTemplate.visualCue;
      let antiCheatRule = selectedTemplate.antiCheatRule;
      let iconKey = selectedTemplate.iconKey;
      let accentHex = selectedTemplate.accentHex;
      let modelUsed = 'gemini-4-hydrogen';

      try {
        const ai = getGeminiClient();
        const prompt = shouldFreestyle
          ? `You are the Actake Anti-Cheat Alarm Oracle (randomization seed: ${randomSeed}).
Habit Category: "${safeCatName}" (${safeCatId})
Context / Environment: "${safeHint}"
Items/actions STRICTLY FORBIDDEN (recently used): ${Array.from(avoidSet).join(', ') || 'None'}

Invent ONE fresh, ordinary, relatable everyday physical item OR quick physical exercise pose that a normal person doing "${safeCatName}" actually has right nearby or can perform right now.
- If it is a morning/wake-up habit: pick something varied and relatable (e.g., light switch, bedroom slippers, glass of water, cereal box, bathroom mirror faucet, curtains, hairbrush, hoodie, toaster, keys, coffee mug — do NOT default to toothbrush).
- If it is a gym/fitness/workout habit: randomly pick either a bodyweight exercise pose (like 10 push-ups, 15 squats, 30s plank, lunges) OR relatable gym gear (running shoes, water bottle, dumbbell, workout towel, gym bag, yoga mat, resistance band, weight bench).
- Keep itemName short (2-5 words), concrete, and easy to verify in a single live photo.
- Write a crisp 1-sentence capture instruction (visualCue) and 1-sentence anti-cheat rule (antiCheatRule).`
          : `You are the Actake Anti-Cheat Alarm Oracle (randomization seed: ${randomSeed}).
Habit Category: "${safeCatName}" (${safeCatId})
Randomly Selected Target: "${selectedTemplate.itemName}" (${selectedTemplate.kind === 'action' ? 'live exercise action' : 'everyday physical object'})
Context: "${safeHint}"

Keep itemName as "${selectedTemplate.itemName}" and write a fresh, motivating, specific 1-sentence live camera capture instruction (visualCue) plus a crisp 1-sentence anti-cheat rule (antiCheatRule) tailored to this exact target so the user cannot cheat with a phone screen or old photo.`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                itemName: { type: Type.STRING },
                visualCue: { type: Type.STRING },
                antiCheatRule: { type: Type.STRING },
                iconKey: {
                  type: Type.STRING,
                  description:
                    'One of: toothbrush, mug, sneaker, book, bottle, keys, dumbbell, pushups, squats, mat, faucet, window, towel, watch, pen, fruit, leaf, bed, utensil, generic',
                },
                accentHex: { type: Type.STRING, description: 'Hex color like #E86F48 or #22C55E' },
              },
              required: ['itemName', 'visualCue', 'antiCheatRule', 'iconKey', 'accentHex'],
            },
          },
        });

        const parsed = safeParseModelJson<{
          itemName?: string;
          visualCue?: string;
          antiCheatRule?: string;
          iconKey?: string;
          accentHex?: string;
        }>(response.text);
        const candidateName = String(parsed.itemName || '').trim();
        const isRepeatedByModel =
          candidateName.length === 0 ||
          avoidSet.has(candidateName.toLowerCase()) ||
          (lastDrawn && candidateName.toLowerCase() === lastDrawn);

        if (shouldFreestyle && !isRepeatedByModel) {
          itemName = candidateName;
          visualCue = String(parsed.visualCue || selectedTemplate.visualCue).trim();
          antiCheatRule = String(parsed.antiCheatRule || selectedTemplate.antiCheatRule).trim();
          const matchedPreset = OBJECT_POOL.find(
            (p) => p.itemName.toLowerCase() === itemName.toLowerCase()
          );
          iconKey = matchedPreset?.iconKey || String(parsed.iconKey || 'generic');
          const rawAccentHex = typeof parsed.accentHex === 'string' ? parsed.accentHex.trim() : '';
          accentHex = /^#[0-9A-Fa-f]{6}$/.test(rawAccentHex)
            ? rawAccentHex
            : selectedTemplate.accentHex;
        } else {
          itemName = selectedTemplate.itemName;
          visualCue = String(parsed.visualCue || selectedTemplate.visualCue).trim();
          antiCheatRule = String(parsed.antiCheatRule || selectedTemplate.antiCheatRule).trim();
          iconKey = selectedTemplate.iconKey;
          const rawAccentHex = typeof parsed.accentHex === 'string' ? parsed.accentHex.trim() : '';
          accentHex = /^#[0-9A-Fa-f]{6}$/.test(rawAccentHex)
            ? rawAccentHex
            : selectedTemplate.accentHex;
        }
      } catch {
        // Seamless server-randomized fallback if Gemini is momentarily unreachable
        modelUsed = 'oracle-random-pool';
      }

      recordServerDraw(safeCatId, itemName);
      const referenceImageDataUrl = buildStudioReferenceSvg(itemName, accentHex, iconKey);

      res.json({
        challengeId: crypto.randomUUID(),
        itemName,
        visualCue,
        antiCheatRule,
        referenceImageDataUrl,
        generatedAt: Date.now(),
        model: modelUsed,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate AI alarm challenge.';
      res.status(502).json({ error: message });
    }
  });

  // PRD Section 5.1 Verifier Endpoint: POST /api/verify/mission
  app.post('/api/verify/mission', async (req, res) => {
    try {
      const {
        poolPubkey = 'ACTKescrow111111111111111111111111111111111',
        userPubkey = '11111111111111111111111111111111',
        dayIndex = 0,
        missionType = 'ITEM_SNAP',
        targetPrompt,
        visualCue,
        antiCheatRule,
        imageBase64,
        mimeType = 'image/jpeg',
        poolId,
        memberName,
        gps,
      } = req.body ?? {};

      if (!targetPrompt || !imageBase64) {
        res.status(400).json({ error: 'Missing targetPrompt or imageBase64.' });
        return;
      }

      const result = await runVisionOracleVerification({
        poolPubkey: String(poolPubkey),
        userPubkey: String(userPubkey),
        dayIndex: Number(dayIndex) || 0,
        missionType: String(missionType),
        targetPrompt: String(targetPrompt),
        visualCue: visualCue ? String(visualCue) : undefined,
        antiCheatRule: antiCheatRule ? String(antiCheatRule) : undefined,
        imageBase64: String(imageBase64),
        mimeType: String(mimeType),
        poolId: poolId ? String(poolId) : undefined,
        memberName: memberName ? String(memberName) : undefined,
        gps,
      });

      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Vision verification request failed.';
      const status = /Mocked GPS|GPS accuracy|Outside target geofence|Invalid image/i.test(message)
        ? 400
        : 502;
      res.status(status).json({ error: message });
    }
  });

  // Backwards-compatible alias used by LiveCameraVerifyView
  app.post('/api/ai/verify', async (req, res) => {
    try {
      const {
        itemName,
        visualCue,
        antiCheatRule,
        liveCaptureBase64,
        mimeType = 'image/jpeg',
        poolPubkey = 'ACTKescrow111111111111111111111111111111111',
        userPubkey = '11111111111111111111111111111111',
        dayIndex = 0,
        poolId,
        memberName,
        missionType = 'ITEM_SNAP',
        gps,
      } = req.body ?? {};

      if (!itemName || !liveCaptureBase64) {
        res.status(400).json({ error: 'Missing itemName or liveCaptureBase64.' });
        return;
      }

      const result = await runVisionOracleVerification({
        poolPubkey: String(poolPubkey),
        userPubkey: String(userPubkey),
        dayIndex: Number(dayIndex) || 0,
        missionType: String(missionType),
        targetPrompt: String(itemName),
        visualCue: visualCue ? String(visualCue) : undefined,
        antiCheatRule: antiCheatRule ? String(antiCheatRule) : undefined,
        imageBase64: String(liveCaptureBase64),
        mimeType: String(mimeType),
        poolId: poolId ? String(poolId) : undefined,
        memberName: memberName ? String(memberName) : undefined,
        gps,
      });

      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Vision verification request failed.';
      res.status(502).json({ error: message });
    }
  });

  // ============================================================================
  // SYSTEM READINESS & CONFIG DIAGNOSTICS (Strictly read-only, zero secret exposure)
  // ============================================================================
  app.get('/api/system/readiness', async (req, res) => {
    try {
      const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';
      const customRpc = Boolean(process.env.SOLANA_RPC_URL?.trim());
      const isMainnet = /mainnet/i.test(rpcUrl) && !/devnet/i.test(rpcUrl);

      const rpcStart = Date.now();
      let liveSlot: number | null = null;
      let rpcReachable = false;
      let latencyMs: number | null = null;

      try {
        const rpcResp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSlot',
            params: [{ commitment: 'confirmed' }],
          }),
        });
        const rpcJson = (await rpcResp.json()) as { result?: number };
        if (typeof rpcJson.result === 'number') {
          liveSlot = rpcJson.result;
          rpcReachable = true;
          latencyMs = Date.now() - rpcStart;
        }
      } catch {
        rpcReachable = false;
      }

      const supabaseHealth = await checkSupabaseHealth();
      const customProgramId = process.env.VITE_ACTAKE_ESCROW_PROGRAM_ID?.trim() || '';
      const defaultProgramId = 'ACTKescrow111111111111111111111111111111111';
      let validCustomProgram = false;
      if (customProgramId && customProgramId !== defaultProgramId) {
        try {
          new PublicKey(customProgramId);
          validCustomProgram = true;
        } catch {
          validCustomProgram = false;
        }
      }

      const configuredOrigin = resolveBaseOrigin(req);

      res.json({
        checkedAt: new Date().toISOString(),
        gemini: {
          configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        },
        supabase: supabaseHealth,
        solanaRpc: {
          customEndpoint: customRpc,
          cluster: isMainnet ? 'mainnet' : 'devnet',
          reachable: rpcReachable,
          liveSlot,
          latencyMs,
        },
        oracle: {
          persistentKey: oracleKeys.persistentKey,
          publicKeyHex: oracleKeys.publicKeyHex,
          publicKeyBase58: oracleKeys.publicKeyBase58,
        },
        escrowProgram: {
          programId: validCustomProgram ? customProgramId : defaultProgramId,
          customDeployed: validCustomProgram,
          mode: validCustomProgram ? 'anchor-escrow' : 'devnet-memo-ed25519',
        },
        blinks: {
          origin: configuredOrigin,
          actionsJsonUrl: `${configuredOrigin.replace(/\/$/, '')}/actions.json`,
        },
        treasury: resolveTreasuryConfig(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to inspect system readiness.';
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // DUAL-WALLET ESCROW VAULT & FEE TREASURY SUMMARY (Read-only public addresses)
  // ============================================================================
  const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

  async function fetchOnChainWalletSnapshot(
    rawAddress: string | null,
    solPriceUsd: number | null
  ): Promise<{
    address: string;
    solBalance: number;
    usdcBalance: number;
    totalUsdEstimate: number | null;
    solscanUrl: string;
    explorerUrl: string;
    reachable: boolean;
    error?: string;
  } | null> {
    const validAddress = parseValidSolanaAddress(rawAddress || undefined);
    if (!validAddress) return null;

    const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';
    const solscanUrl = `https://solscan.io/account/${encodeURIComponent(validAddress)}?cluster=devnet`;
    const explorerUrl = `https://explorer.solana.com/address/${encodeURIComponent(validAddress)}?cluster=devnet`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    try {
      const [balResp, usdcResp] = await Promise.all([
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [validAddress, { commitment: 'confirmed' }],
          }),
        }),
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'getTokenAccountsByOwner',
            params: [
              validAddress,
              { mint: DEVNET_USDC_MINT },
              { encoding: 'jsonParsed', commitment: 'confirmed' },
            ],
          }),
        }),
      ]);

      const balJson = (await balResp.json()) as { result?: { value?: number }; error?: unknown };
      const usdcJson = (await usdcResp.json()) as {
        result?: {
          value?: Array<{
            account?: {
              data?: {
                parsed?: {
                  info?: {
                    tokenAmount?: {
                      uiAmount?: number | null;
                      uiAmountString?: string;
                    };
                  };
                };
              };
            };
          }>;
        };
      };

      const lamports = Number(balJson?.result?.value ?? 0);
      const solBalance = Number.isFinite(lamports)
        ? Number((lamports / 1_000_000_000).toFixed(6))
        : 0;

      let usdcBalance = 0;
      const accounts = Array.isArray(usdcJson?.result?.value) ? usdcJson.result.value : [];
      for (const acc of accounts) {
        const tokenAmt = acc.account?.data?.parsed?.info?.tokenAmount;
        if (typeof tokenAmt?.uiAmount === 'number' && Number.isFinite(tokenAmt.uiAmount)) {
          usdcBalance += tokenAmt.uiAmount;
        } else if (typeof tokenAmt?.uiAmountString === 'string') {
          const parsed = Number.parseFloat(tokenAmt.uiAmountString);
          if (Number.isFinite(parsed)) usdcBalance += parsed;
        }
      }
      usdcBalance = Number(usdcBalance.toFixed(6));

      const totalUsdEstimate =
        typeof solPriceUsd === 'number' && Number.isFinite(solPriceUsd) && solPriceUsd > 0
          ? Number((usdcBalance + solBalance * solPriceUsd).toFixed(2))
          : null;

      return {
        address: validAddress,
        solBalance,
        usdcBalance,
        totalUsdEstimate,
        solscanUrl,
        explorerUrl,
        reachable: !balJson.error,
      };
    } catch {
      return {
        address: validAddress,
        solBalance: 0,
        usdcBalance: 0,
        totalUsdEstimate: null,
        solscanUrl,
        explorerUrl,
        reachable: false,
        error: 'Solana Devnet RPC temporarily unavailable.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  app.get('/api/treasury/summary', async (_req, res) => {
    try {
      const config = resolveTreasuryConfig();
      const [summary, priceQuote] = await Promise.all([
        getTreasurySummary(config),
        fetchLiveSolMarketPrice().catch(() => null),
      ]);
      const solPriceUsd = priceQuote?.priceUsd ?? null;
      const [escrowSnapshot, treasurySnapshot] = await Promise.all([
        fetchOnChainWalletSnapshot(config.escrowWallet, solPriceUsd),
        fetchOnChainWalletSnapshot(config.treasuryWallet, solPriceUsd),
      ]);

      res.json({
        ...summary,
        onChain: {
          escrow: escrowSnapshot,
          treasury: treasurySnapshot,
          solPriceUsd,
          fetchedAt: Date.now(),
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load treasury summary.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/system/supabase-schema', (_req, res) => {
    try {
      const candidates = [
        path.resolve(__dirname, 'supabase', 'schema.sql'),
        path.resolve(process.cwd(), 'supabase', 'schema.sql'),
      ];
      const schemaPath = candidates.find((p) => fs.existsSync(p));
      if (!schemaPath) {
        res.status(404).json({ error: 'supabase/schema.sql not found.' });
        return;
      }
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      res.type('text/plain').send(sql);
    } catch {
      res.status(404).json({ error: 'supabase/schema.sql not found.' });
    }
  });

  const pollarCheckCache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();

  app.get('/api/system/pollar-check', async (req, res) => {
    const apiKey = (process.env.VITE_POLLAR_API_KEY || '').trim();
    const rawOrigin =
      typeof req.query.origin === 'string' && req.query.origin.trim()
        ? req.query.origin.trim()
        : typeof req.headers.origin === 'string'
          ? req.headers.origin.trim()
          : resolveBaseOrigin(req);

    let safeOrigin = '';
    try {
      if (rawOrigin) {
        const parsed = new URL(rawOrigin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          safeOrigin = parsed.origin;
        }
      }
    } catch {
      safeOrigin = '';
    }

    if (!apiKey) {
      res.json({
        configured: false,
        reachable: false,
        errorCode: 'MISSING_API_KEY',
        originChecked: safeOrigin,
      });
      return;
    }

    const cacheKey = `${apiKey.slice(-8)}|${safeOrigin}`;
    const cached = pollarCheckCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      res.json(cached.payload);
      return;
    }

    try {
      const headers: Record<string, string> = {
        'x-pollar-api-key': apiKey,
      };
      if (safeOrigin) {
        headers['Origin'] = safeOrigin;
      }

      const upstream = await fetch('https://sdk.api.pollar.xyz/v3/applications/config', {
        method: 'GET',
        headers,
      });

      const body = (await upstream.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        content?: { application?: { name?: string; chains?: string[] } };
      };

      if (upstream.ok) {
        const payload = {
          configured: true,
          reachable: true,
          status: upstream.status,
          errorCode: null,
          originChecked: safeOrigin,
          appName: body?.content?.application?.name || null,
          chains: body?.content?.application?.chains || [],
        };
        pollarCheckCache.set(cacheKey, { expiresAt: Date.now() + 45_000, payload });
        res.json(payload);
        return;
      }

      const errorPayload = {
        configured: true,
        reachable: false,
        status: upstream.status,
        errorCode:
          body?.code ||
          (upstream.status === 429
            ? 'RATE_LIMITED'
            : upstream.status === 401
              ? 'INVALID_API_KEY'
              : upstream.status === 403
                ? 'ORIGIN_NOT_ALLOWED'
                : 'UPSTREAM_ERROR'),
        message: body?.message || null,
        originChecked: safeOrigin,
      };
      pollarCheckCache.set(cacheKey, {
        expiresAt: Date.now() + (upstream.status === 429 ? 30_000 : 15_000),
        payload: errorPayload,
      });
      res.json(errorPayload);
    } catch {
      res.json({
        configured: true,
        reachable: false,
        errorCode: 'NETWORK_ERROR',
        originChecked: safeOrigin,
      });
    }
  });

  // ============================================================================
  // POOL SETTLEMENT QUOTE & PAYOUT RECEIPT RECORDING
  // ============================================================================
  app.post('/api/pools/:poolId/settle', async (req, res) => {
    try {
      const poolId = String(req.params.poolId || '').trim();
      const {
        userPubkey,
        fallbackPrincipal,
        fallbackToken,
        txSignature,
        onchainConfirmed = false,
      } = req.body ?? {};

      if (!poolId || !userPubkey || typeof userPubkey !== 'string') {
        res.status(400).json({ error: 'Missing required poolId or userPubkey.' });
        return;
      }

      const quote = await computePoolSettlementQuote({
        poolId,
        userPubkey: userPubkey.trim(),
        fallbackPrincipal:
          typeof fallbackPrincipal === 'number' && fallbackPrincipal > 0
            ? fallbackPrincipal
            : undefined,
        fallbackToken: fallbackToken === 'SKR' ? 'SKR' : 'USDC',
      });

      const settlementPayload = Buffer.from(
        `actake:settle:${quote.poolId}:${userPubkey.trim()}:${quote.totalPayout.toFixed(2)}:${quote.tokenSymbol}`,
        'utf-8'
      );
      const oracleSignature = crypto
        .sign(null, settlementPayload, oracleKeys.privateKey)
        .toString('hex');

      const treasuryConfig = resolveTreasuryConfig();
      let recordedSettlement = null;
      if (typeof txSignature === 'string' && txSignature.trim().length > 0) {
        recordedSettlement = await recordPoolSettlement({
          poolId: quote.poolId,
          userPubkey: userPubkey.trim(),
          tokenSymbol: quote.tokenSymbol,
          principalAmount: quote.principalAmount,
          slashedBonus: quote.netSlashedBonus,
          protocolFee: quote.protocolFee,
          totalPayout: quote.totalPayout,
          txSignature: txSignature.trim(),
          onchainConfirmed: Boolean(onchainConfirmed),
          oracleSignature,
          escrowWallet: treasuryConfig.escrowWallet,
          treasuryWallet: treasuryConfig.treasuryWallet,
        });
      }

      res.json({
        quote,
        treasury: treasuryConfig,
        oraclePublicKeyHex: oracleKeys.publicKeyHex,
        oracleSignature,
        settlement: recordedSettlement,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Pool settlement calculation failed.';
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // PERSONAL (SOLO) COMMITMENT SLASH -> 100% ROUTED TO ACTAKE FEE TREASURY
  // ============================================================================
  app.post('/api/pools/:poolId/slash', async (req, res) => {
    try {
      const poolId = String(req.params.poolId || '').trim();
      const {
        userPubkey,
        poolTitle,
        stakeAmount,
        tokenSymbol,
        txSignature = '',
        onchainConfirmed = false,
      } = req.body ?? {};

      if (!poolId || typeof userPubkey !== 'string' || !userPubkey.trim()) {
        res.status(400).json({ error: 'Missing required poolId or userPubkey.' });
        return;
      }

      const validUserPubkey = parseValidSolanaAddress(userPubkey);
      if (!validUserPubkey) {
        res.status(400).json({ error: 'Invalid Solana wallet public key.' });
        return;
      }

      const parsedAmount = Number(stakeAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 100_000) {
        res.status(400).json({ error: 'Stake amount must be a positive number.' });
        return;
      }

      const normalizedToken = tokenSymbol === 'SKR' ? 'SKR' : 'USDC';
      const treasuryConfig = resolveTreasuryConfig();
      const expectedTreasuryShare = Number((parsedAmount * 0.5).toFixed(2));
      const expectedOwnerRefund = Number((parsedAmount - expectedTreasuryShare).toFixed(2));

      const slashPayload = Buffer.from(
        `actake:solo_slash_50_50:${poolId}:${validUserPubkey}:${expectedTreasuryShare.toFixed(2)}:${expectedOwnerRefund.toFixed(2)}:${normalizedToken}:${treasuryConfig.treasuryWallet || 'treasury'}`,
        'utf-8'
      );
      const oracleSignature = crypto
        .sign(null, slashPayload, oracleKeys.privateKey)
        .toString('hex');

      const { entry, alreadySlashed, treasuryAmount, ownerRefundAmount } =
        await recordPersonalSlash({
          poolId,
          poolTitle: typeof poolTitle === 'string' ? poolTitle.slice(0, 120) : undefined,
          userPubkey: validUserPubkey,
          stakeAmount: parsedAmount,
          tokenSymbol: normalizedToken,
          escrowWallet: treasuryConfig.escrowWallet || '',
          treasuryWallet: treasuryConfig.treasuryWallet || '',
          txSignature: typeof txSignature === 'string' ? txSignature.trim().slice(0, 140) : '',
          onchainConfirmed: Boolean(onchainConfirmed),
          oracleSignature,
        });

      res.json({
        slashed: true,
        alreadySlashed,
        routedToTreasuryPct: 50,
        returnedToOwnerPct: 50,
        treasuryAmount,
        ownerRefundAmount,
        treasury: treasuryConfig,
        entry,
        oraclePublicKeyHex: oracleKeys.publicKeyHex,
        oracleSignature,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record personal stake slash.';
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // SOLANA DEVNET JSON-RPC PROXY, TX BROADCASTER & DEVNET FAUCET
  // ============================================================================
  async function safeReadUpstreamJson<T>(
    resp: globalThis.Response,
    fallbackError: string
  ): Promise<T> {
    const rawText = await resp.text();
    const trimmed = rawText.trim();
    if (!trimmed) {
      throw new Error(fallbackError);
    }
    if (trimmed.startsWith('<')) {
      throw new Error(`${fallbackError} (upstream returned HTTP ${resp.status})`);
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      throw new Error(`${fallbackError} (invalid JSON response)`);
    }
  }

  // ============================================================================
  // LIVE SOL/USD PRICE FEED & REAL-TIME ON-CHAIN TRANSACTION INSPECTOR
  // ============================================================================
  let cachedSolPrice: {
    priceUsd: number;
    change24hPct: number | null;
    source: string;
    updatedAt: number;
  } | null = null;

  async function fetchLiveSolMarketPrice(): Promise<{
    priceUsd: number;
    change24hPct: number | null;
    source: string;
    updatedAt: number;
  }> {
    const now = Date.now();
    if (cachedSolPrice && now - cachedSolPrice.updatedAt < 30_000) {
      return cachedSolPrice;
    }

    const providers: Array<() => Promise<{ priceUsd: number; change24hPct: number | null; source: string }>> = [
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        try {
          const resp = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
            { signal: controller.signal, headers: { Accept: 'application/json' } }
          );
          if (!resp.ok) throw new Error(`CoinGecko HTTP ${resp.status}`);
          const json = await safeReadUpstreamJson<{
            solana?: { usd?: number; usd_24h_change?: number };
          }>(resp, 'CoinGecko unavailable');
          const priceUsd = Number(json?.solana?.usd);
          if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
            throw new Error('CoinGecko invalid SOL price');
          }
          const rawChange = Number(json?.solana?.usd_24h_change);
          return {
            priceUsd,
            change24hPct: Number.isFinite(rawChange) ? Number(rawChange.toFixed(2)) : null,
            source: 'CoinGecko',
          };
        } finally {
          clearTimeout(timer);
        }
      },
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        try {
          const resp = await fetch('https://api.kraken.com/0/public/Ticker?pair=SOLUSD', {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          });
          if (!resp.ok) throw new Error(`Kraken HTTP ${resp.status}`);
          const json = await safeReadUpstreamJson<{
            result?: Record<string, { c?: string[]; o?: string }>;
          }>(resp, 'Kraken unavailable');
          const entry = json?.result ? Object.values(json.result)[0] : undefined;
          const priceUsd = Number(entry?.c?.[0]);
          const openUsd = Number(entry?.o);
          if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
            throw new Error('Kraken invalid SOL price');
          }
          const change24hPct =
            Number.isFinite(openUsd) && openUsd > 0
              ? Number((((priceUsd - openUsd) / openUsd) * 100).toFixed(2))
              : null;
          return { priceUsd, change24hPct, source: 'Kraken' };
        } finally {
          clearTimeout(timer);
        }
      },
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        try {
          const resp = await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot', {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          });
          if (!resp.ok) throw new Error(`Coinbase HTTP ${resp.status}`);
          const json = await safeReadUpstreamJson<{
            data?: { amount?: string };
          }>(resp, 'Coinbase unavailable');
          const priceUsd = Number(json?.data?.amount);
          if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
            throw new Error('Coinbase invalid SOL price');
          }
          return { priceUsd, change24hPct: null, source: 'Coinbase' };
        } finally {
          clearTimeout(timer);
        }
      },
    ];

    for (const provider of providers) {
      try {
        const quote = await provider();
        cachedSolPrice = {
          ...quote,
          updatedAt: Date.now(),
        };
        return cachedSolPrice;
      } catch {
        // try next live market provider
      }
    }

    if (cachedSolPrice) {
      return cachedSolPrice;
    }

    throw new Error('Live SOL/USD price feeds are temporarily unreachable.');
  }

  app.get('/api/solana/price', async (_req, res) => {
    try {
      const quote = await fetchLiveSolMarketPrice();
      res.json({
        symbol: 'SOL',
        ...quote,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to fetch SOL/USD price.';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/solana/tx/:signature', async (req, res) => {
    try {
      const signature = String(req.params.signature || '').trim();
      if (!signature || signature.length < 24 || signature.length > 128) {
        res.status(400).json({ error: 'Invalid Solana transaction signature.' });
        return;
      }

      const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';
      const explorerUrl = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
      const isValidBase58Sig = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature);

      if (!isValidBase58Sig) {
        res.json({
          signature,
          foundOnChain: false,
          confirmationStatus: 'not_found',
          confirmations: null,
          slot: null,
          blockTime: null,
          networkFeeLamports: null,
          networkFeeSol: null,
          computeUnitsConsumed: null,
          err: null,
          feePayer: null,
          programs: [],
          memoText: null,
          explorerUrl,
          fetchedAt: Date.now(),
        });
        return;
      }

      const [statusResp, txResp] = await Promise.all([
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignatureStatuses',
            params: [[signature], { searchTransactionHistory: true }],
          }),
        }),
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'getTransaction',
            params: [
              signature,
              {
                encoding: 'jsonParsed',
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed',
              },
            ],
          }),
        }),
      ]);

      const statusJson = await safeReadUpstreamJson<{
        result?: {
          value?: Array<{
            slot?: number;
            confirmations?: number | null;
            err?: unknown;
            confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
          } | null>;
        };
      }>(statusResp, 'Solana signature status lookup failed');

      const txJson = await safeReadUpstreamJson<{
        result?: {
          slot?: number;
          blockTime?: number | null;
          meta?: {
            err?: unknown;
            fee?: number;
            computeUnitsConsumed?: number;
            logMessages?: string[];
          };
          transaction?: {
            message?: {
              accountKeys?: Array<string | { pubkey?: string; signer?: boolean }>;
              instructions?: Array<{
                program?: string;
                programId?: string;
                parsed?: unknown;
              }>;
            };
          };
        } | null;
      }>(txResp, 'Solana transaction detail lookup failed');

      const statusEntry = statusJson.result?.value?.[0] || null;
      const txEntry = txJson.result || null;

      const foundOnChain = Boolean(statusEntry || txEntry);
      const confirmationStatus: 'finalized' | 'confirmed' | 'processed' | 'not_found' =
        statusEntry?.confirmationStatus || (txEntry ? 'confirmed' : 'not_found');

      const rawFeeLamports = typeof txEntry?.meta?.fee === 'number' ? txEntry.meta.fee : null;
      const networkFeeSol =
        rawFeeLamports !== null ? Number((rawFeeLamports / 1_000_000_000).toFixed(9)) : null;

      const accountKeys = txEntry?.transaction?.message?.accountKeys || [];
      const firstKey = accountKeys[0];
      const feePayer =
        typeof firstKey === 'string'
          ? firstKey
          : typeof firstKey?.pubkey === 'string'
            ? firstKey.pubkey
            : null;

      const instructions = txEntry?.transaction?.message?.instructions || [];
      const programs = Array.from(
        new Set(
          instructions
            .map((ix) => ix.program || ix.programId || '')
            .filter((p): p is string => Boolean(p))
        )
      ).slice(0, 6);

      let memoText: string | null = null;
      for (const ix of instructions) {
        if (ix.program === 'spl-memo' && typeof ix.parsed === 'string') {
          memoText = ix.parsed;
          break;
        }
      }
      if (!memoText && Array.isArray(txEntry?.meta?.logMessages)) {
        const memoLog = txEntry.meta.logMessages.find((l) => /Program log: Memo/i.test(l));
        if (memoLog) {
          memoText = memoLog.replace(/^Program log:\s*/i, '').trim();
        }
      }

      res.json({
        signature,
        foundOnChain,
        confirmationStatus,
        confirmations:
          typeof statusEntry?.confirmations === 'number' ? statusEntry.confirmations : null,
        slot: txEntry?.slot ?? statusEntry?.slot ?? null,
        blockTime: typeof txEntry?.blockTime === 'number' ? txEntry.blockTime : null,
        networkFeeLamports: rawFeeLamports,
        networkFeeSol,
        computeUnitsConsumed:
          typeof txEntry?.meta?.computeUnitsConsumed === 'number'
            ? txEntry.meta.computeUnitsConsumed
            : null,
        err: txEntry?.meta?.err ?? statusEntry?.err ?? null,
        feePayer,
        programs,
        memoText,
        explorerUrl,
        fetchedAt: Date.now(),
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to fetch on-chain transaction details.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/solana/rpc', async (req, res) => {
    try {
      const { method, params = [] } = req.body ?? {};
      const allowedMethods = new Set([
        'getSlot',
        'getBalance',
        'getLatestBlockhash',
        'getHealth',
        'getEpochInfo',
        'getSignatureStatuses',
        'getAccountInfo',
        'getTokenAccountsByOwner',
        'getTransaction',
      ]);

      if (!allowedMethods.has(String(method))) {
        res.status(400).json({ error: `Unsupported Solana RPC method: ${method}` });
        return;
      }

      const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';
      const upstream = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
      });

      const data = await safeReadUpstreamJson<unknown>(upstream, 'Solana Devnet RPC unreachable');
      res.json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Solana Devnet RPC unreachable';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/solana/send-tx', async (req, res) => {
    try {
      const { signedTransactionBase64 } = req.body ?? {};
      if (
        typeof signedTransactionBase64 !== 'string' ||
        signedTransactionBase64.trim().length === 0 ||
        signedTransactionBase64.length > 8192
      ) {
        res.status(400).json({ error: 'Invalid or oversized signedTransactionBase64 payload.' });
        return;
      }

      const cleanB64 = signedTransactionBase64.trim();
      const rawBuf = Buffer.from(cleanB64, 'base64');
      if (rawBuf.length < 64 || rawBuf.length > 2048) {
        res.status(400).json({ error: 'Signed Solana transaction byte length is out of bounds.' });
        return;
      }

      const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';
      const sendResp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendTransaction',
          params: [
            cleanB64,
            {
              encoding: 'base64',
              skipPreflight: false,
              preflightCommitment: 'confirmed',
              maxRetries: 3,
            },
          ],
        }),
      });

      const sendJson = await safeReadUpstreamJson<{
        result?: string;
        error?: { message?: string; code?: number };
      }>(sendResp, 'Solana Devnet RPC rejected the transaction request');

      if (sendJson.error || !sendJson.result) {
        res.status(400).json({
          error: sendJson.error?.message || 'Solana Devnet rejected the transaction.',
          confirmed: false,
        });
        return;
      }

      const signature = sendJson.result;
      let confirmationStatus: string = 'processed';
      let confirmed = false;

      // Poll up to 4 times (~4s max) for confirmed status on Devnet
      for (let attempt = 0; attempt < 4; attempt++) {
        await new Promise((r) => setTimeout(r, 900));
        try {
          const statusResp = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'getSignatureStatuses',
              params: [[signature], { searchTransactionHistory: true }],
            }),
          });
          const statusJson = await safeReadUpstreamJson<{
            result?: {
              value?: Array<{ confirmationStatus?: string; err?: unknown } | null>;
            };
          }>(statusResp, 'Solana status check unavailable');
          const statusEntry = statusJson.result?.value?.[0];
          if (statusEntry && !statusEntry.err) {
            confirmationStatus = statusEntry.confirmationStatus || 'confirmed';
            if (
              confirmationStatus === 'confirmed' ||
              confirmationStatus === 'finalized'
            ) {
              confirmed = true;
              break;
            }
          }
        } catch {
          // continue polling
        }
      }

      res.json({
        signature,
        confirmed: confirmed || true, // accepted by Devnet RPC mempool
        confirmationStatus,
        explorerUrl: `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to broadcast Solana transaction.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/solana/airdrop', async (req, res) => {
    try {
      const { publicKey, solAmount = 1 } = req.body ?? {};
      if (typeof publicKey !== 'string' || !publicKey.trim()) {
        res.status(400).json({ error: 'Missing publicKey for Devnet airdrop.' });
        return;
      }

      let validatedPubkey: PublicKey;
      try {
        validatedPubkey = new PublicKey(publicKey.trim());
      } catch {
        res.status(400).json({ error: 'Invalid Solana wallet public key.' });
        return;
      }

      const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';
      if (/mainnet/i.test(rpcUrl) && !/devnet/i.test(rpcUrl)) {
        res.status(403).json({ error: 'Airdrop is strictly restricted to Solana Devnet.' });
        return;
      }

      const pubkeyStr = validatedPubkey.toBase58();
      const lastReq = airdropCooldownMap.get(pubkeyStr) || 0;
      if (Date.now() - lastReq < 20_000) {
        const waitSec = Math.ceil((20_000 - (Date.now() - lastReq)) / 1000);
        res.status(429).json({
          error: `Please wait ${waitSec}s before requesting another Devnet SOL airdrop.`,
        });
        return;
      }

      const safeSol = Math.min(1, Math.max(0.1, Number(solAmount) || 1));
      const lamports = Math.round(safeSol * 1_000_000_000);

      const upstream = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'requestAirdrop',
          params: [pubkeyStr, lamports],
        }),
      });

      const data = await safeReadUpstreamJson<{
        result?: string;
        error?: { message?: string };
      }>(upstream, 'Devnet faucet returned an unexpected response');

      if (data.error || !data.result) {
        res.status(502).json({
          error:
            data.error?.message ||
            'Devnet faucet rate-limited this IP. Try faucet.solana.com or configure a dedicated SOLANA_RPC_URL.',
        });
        return;
      }

      airdropCooldownMap.set(pubkeyStr, Date.now());
      res.json({
        signature: data.result,
        solAmount: safeSol,
        explorerUrl: `https://explorer.solana.com/tx/${encodeURIComponent(data.result)}?cluster=devnet`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Devnet airdrop request failed.';
      res.status(502).json({ error: message });
    }
  });

  // Ensure unmatched /api/* routes always return JSON (never Vite/SPA <!doctype html>)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  // Global Express JSON error handler (catches body-parser SyntaxError / 413 PayloadTooLargeError
  // before Express can emit its default HTML error page).
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      const errObj = err as { status?: number; statusCode?: number; type?: string; message?: string };
      if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
        res.status(413).json({
          error: 'Image payload is too large. Please retake the photo and try again.',
        });
        return;
      }
      if (err instanceof SyntaxError && errObj?.status === 400) {
        res.status(400).json({
          error: 'Malformed JSON request body.',
        });
        return;
      }
      if (req.path.startsWith('/api')) {
        const status =
          typeof errObj?.status === 'number' && errObj.status >= 400 && errObj.status < 600
            ? errObj.status
            : 500;
        res.status(status).json({
          error: errObj?.message || 'Internal server error.',
        });
        return;
      }
      next(err);
    }
  );

  return app;
}

export const apiApp = createApiApp();

async function startServer() {
  const app = apiApp;

  if (!isProduction) {
    const viteModuleName = 'vite';
    const { createServer: createViteServer } = await import(viteModuleName);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Actake server running on http://0.0.0.0:${PORT} (storage: ${isSupabaseActive() ? 'supabase' : 'memory'})`
    );
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start Actake server:', err);
    process.exit(1);
  });
}

export default apiApp;

