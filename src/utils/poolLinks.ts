export interface ParsedPoolInviteInput {
  kind: 'url' | 'code' | 'pubkey' | 'slug' | 'text';
  token: string;
}

const SOLANA_PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const INVITE_CODE_RE = /^(?:[A-Za-z0-9]{4,12}|[A-Za-z]{2,5}-[A-Za-z0-9]{3,10})$/;
const POOL_SLUG_RE = /^(?:squad|hunt|stake|pool)-[a-zA-Z0-9_-]{2,72}$/;

function sanitizeToken(raw: string): string {
  return raw
    .trim()
    .replace(/^#/, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, 140);
}

/**
 * Safely parses a user-pasted invite link, Solana Blink URL, `?code=...` query string,
 * bare invite code (e.g. 7AMCLUB, ACT-9F2K), pool ID slug, or pool PDA pubkey.
 * Never performs any network request to user-supplied URLs.
 */
export function parsePoolInviteInput(rawInput: string): ParsedPoolInviteInput | null {
  const raw = rawInput.trim();
  if (!raw || raw.length > 500) return null;

  // Handle prefixed formats like "code:7AMCLUB" or "pool:squad-7am-club"
  const prefixMatch = raw.match(/^(?:code|invite|pool)\s*:\s*(.+)$/i);
  if (prefixMatch?.[1]) {
    const inner = sanitizeToken(prefixMatch[1]);
    return inner ? { kind: 'code', token: inner } : null;
  }

  // Handle full URLs or relative URLs (/squad/:id, ?code=..., ?pool=..., dial.to Blinks)
  const looksLikeUrl =
    /^https?:\/\//i.test(raw) ||
    raw.startsWith('/squad/') ||
    raw.startsWith('/api/actions/join/') ||
    raw.includes('?code=') ||
    raw.includes('?pool=') ||
    raw.includes('dial.to/');

  if (looksLikeUrl) {
    try {
      const normalizedUrl = /^https?:\/\//i.test(raw)
        ? raw
        : raw.startsWith('/')
          ? `https://actake.local${raw}`
          : raw.startsWith('?')
            ? `https://actake.local/${raw}`
            : `https://${raw}`;
      const parsed = new URL(normalizedUrl);

      // Solana Blink: https://dial.to/?action=solana-action:https%3A%2F%2F...%2Fapi%2Factions%2Fjoin%2Fsquad-7am-club
      const actionParam = parsed.searchParams.get('action');
      if (actionParam) {
        const cleanAction = actionParam.replace(/^solana-action:/i, '');
        try {
          const actionUrl = new URL(cleanAction);
          const actionMatch = actionUrl.pathname.match(/\/api\/actions\/join\/([^/?#]+)/i);
          if (actionMatch?.[1]) {
            const token = sanitizeToken(decodeURIComponent(actionMatch[1]));
            if (token) return { kind: 'url', token };
          }
        } catch {
          const inlineMatch = cleanAction.match(/\/api\/actions\/join\/([^/?#]+)/i);
          if (inlineMatch?.[1]) {
            const token = sanitizeToken(decodeURIComponent(inlineMatch[1]));
            if (token) return { kind: 'url', token };
          }
        }
      }

      const queryCandidate =
        parsed.searchParams.get('code') ||
        parsed.searchParams.get('pool') ||
        parsed.searchParams.get('invite');
      if (queryCandidate) {
        const token = sanitizeToken(queryCandidate);
        if (token) return { kind: 'url', token };
      }

      const pathMatch = parsed.pathname.match(
        /\/(?:squad|pool|api\/actions\/join)\/([^/?#]+)\/?$/i
      );
      if (pathMatch?.[1]) {
        const token = sanitizeToken(decodeURIComponent(pathMatch[1]));
        if (token) return { kind: 'url', token };
      }
    } catch {
      // Fallback regex if malformed URL string
      const fallbackMatch = raw.match(/(?:\/squad\/|\/api\/actions\/join\/|[?&](?:code|pool)=)([^&#\s]+)/i);
      if (fallbackMatch?.[1]) {
        const token = sanitizeToken(decodeURIComponent(fallbackMatch[1]));
        if (token) return { kind: 'url', token };
      }
    }
  }

  const clean = sanitizeToken(raw);
  if (!clean || /\s/.test(clean)) {
    return clean ? { kind: 'text', token: clean } : null;
  }

  if (POOL_SLUG_RE.test(clean)) {
    return { kind: 'slug', token: clean };
  }
  if (SOLANA_PUBKEY_RE.test(clean)) {
    return { kind: 'pubkey', token: clean };
  }
  if (INVITE_CODE_RE.test(clean)) {
    return { kind: 'code', token: clean.toUpperCase() };
  }

  return { kind: 'text', token: clean };
}

/**
 * Returns true when the search bar text appears to be a shared pool link,
 * Solana Blink URL, invite code, pool slug, or pool PDA pubkey.
 */
export function looksLikePoolInviteOrLink(rawInput: string): boolean {
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.length < 4) return false;
  const parsed = parsePoolInviteInput(trimmed);
  if (!parsed) return false;
  if (parsed.kind === 'url' || parsed.kind === 'pubkey' || parsed.kind === 'slug') {
    return true;
  }
  if (parsed.kind === 'code') {
    // Require either hyphenated ACT-XXXX, digits+letters, or explicit uppercase invite token
    return (
      /^[A-Z]{2,5}-[A-Z0-9]{3,10}$/.test(trimmed.toUpperCase()) ||
      (/^[A-Za-z0-9]{5,12}$/.test(trimmed) && (/\d/.test(trimmed) || trimmed === trimmed.toUpperCase()))
    );
  }
  return false;
}

const KNOWN_POOL_INVITE_CODES: Record<string, string> = {
  'squad-7am-club': '7AMCLUB',
  'squad-skr-builders': 'SKR6AM',
  'hunt-stadium-run': 'RUN630',
};

export function derivePoolInviteCode(poolId: string, title?: string): string {
  const known = KNOWN_POOL_INVITE_CODES[poolId];
  if (known) return known;

  const source = `${poolId}:${title || ''}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  let val = hash >>> 0;
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[val % alphabet.length];
    val = Math.floor(val / alphabet.length) || (val ^ (i * 7919 + 13));
  }
  return `ACT-${suffix}`;
}

export function buildPoolCodeShareUrl(inviteCode: string): string {
  const baseOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://actake.app';
  return `${baseOrigin}/?code=${encodeURIComponent(inviteCode.toUpperCase())}`;
}
