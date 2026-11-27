export interface SafeFetchJsonOptions extends RequestInit {
  retries?: number;
  retryDelayMs?: number;
  fallbackError?: string;
}

const HTML_OR_XML_PATTERN =
  /^\s*(<!doctype|<html|<head|<body|<pre|<title|<div|<h1|<svg|<\?xml|<[a-z][\w-]*[\s>])/i;

const RAW_JSON_PARSE_ERROR_PATTERN =
  /unexpected token\s*['"`]?<|is not valid json|<!doctype|unexpected end of json input|json\.parse/i;

export function isNonJsonMarkup(text: string): boolean {
  const cleaned = text.replace(/^\uFEFF/, '').trimStart();
  if (!cleaned) return false;
  return cleaned.startsWith('<') || HTML_OR_XML_PATTERN.test(cleaned);
}

/**
 * Strips HTML tags, control characters, and raw JSON syntax-error traces from user-facing strings.
 */
export function sanitizeDisplayText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/^\uFEFF/, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

/**
 * Converts any caught error (including browser SyntaxError like `Unexpected token '<', "<!doctype "... is not valid JSON`)
 * into a clean, user-friendly message without exposing raw parser traces or HTML markup.
 */
export function sanitizeApiErrorMessage(err: unknown, fallbackError: string): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!raw || RAW_JSON_PARSE_ERROR_PATTERN.test(raw) || isNonJsonMarkup(raw)) {
    return fallbackError;
  }
  return sanitizeDisplayText(raw, fallbackError);
}

function friendlyHttpError(status: number, isMarkup: boolean, fallbackError: string): string {
  if (status === 413) {
    return 'Photo payload was too large for the server. Please retake and try again.';
  }
  if (status === 404) {
    return 'Verification endpoint could not be reached. Please try again in a moment.';
  }
  if (status === 429) {
    return 'Service is temporarily rate-limited. Wait a few seconds and try again.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Verification service is temporarily busy. Please try again in a moment.';
  }
  if (isMarkup) {
    return status >= 400
      ? `Server returned an unexpected web page instead of JSON (HTTP ${status}). Please retry.`
      : 'Server returned an unexpected web page instead of JSON. Please retry in a moment.';
  }
  return fallbackError;
}

/**
 * Safely parses a raw HTTP response body into JSON.
 * Strips UTF-8 BOM and optional markdown code fences, and explicitly rejects HTML/XML (`<...`).
 */
export function parseSanitizedJsonText(rawText: string): {
  data: Record<string, unknown> | null;
  isMarkup: boolean;
} {
  const withoutBom = rawText.replace(/^\uFEFF/, '').trim();
  if (!withoutBom) {
    return { data: null, isMarkup: false };
  }

  if (isNonJsonMarkup(withoutBom)) {
    return { data: null, isMarkup: true };
  }

  const unfenced = withoutBom
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (isNonJsonMarkup(unfenced)) {
    return { data: null, isMarkup: true };
  }

  try {
    const parsed: unknown = JSON.parse(unfenced);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, isMarkup: false };
    }
    if (Array.isArray(parsed)) {
      return { data: { items: parsed }, isMarkup: false };
    }
    return { data: null, isMarkup: false };
  } catch {
    return { data: null, isMarkup: false };
  }
}

/**
 * Fetches JSON safely from an API endpoint.
 * Explicitly catches non-JSON / HTML (`Unexpected token '<'`) responses without crashing,
 * sanitizes returned error messages, and retries transient 502/503/504 or HTML gateway responses.
 */
export async function safeFetchJson<T = Record<string, unknown>>(
  input: string,
  options: SafeFetchJsonOptions = {}
): Promise<T> {
  const {
    retries = 1,
    retryDelayMs = 650,
    fallbackError = 'Request failed. Please try again.',
    ...fetchInit
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(input, {
        ...fetchInit,
        headers: {
          Accept: 'application/json',
          ...(fetchInit.headers || {}),
        },
      });

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      const rawText = await resp.text();
      const { data: parsed, isMarkup: bodyLooksLikeMarkup } = parseSanitizedJsonText(rawText);
      const isHtmlContentType =
        contentType.includes('text/html') ||
        contentType.includes('application/xhtml') ||
        contentType.includes('text/xml');
      const isMarkupResponse = bodyLooksLikeMarkup || (isHtmlContentType && parsed === null);

      const isTransientGateway =
        resp.status === 502 || resp.status === 503 || resp.status === 504 || isMarkupResponse;

      if (!resp.ok) {
        const rawServerMessage =
          (typeof parsed?.error === 'string' && parsed.error.trim()) ||
          (typeof parsed?.message === 'string' && parsed.message.trim()) ||
          '';

        const serverMessage = rawServerMessage
          ? sanitizeApiErrorMessage(
              rawServerMessage,
              friendlyHttpError(resp.status, isMarkupResponse, fallbackError)
            )
          : friendlyHttpError(resp.status, isMarkupResponse, fallbackError);

        if (isTransientGateway && attempt < retries) {
          lastError = new Error(serverMessage);
          await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs * (attempt + 1)));
          continue;
        }
        throw new Error(serverMessage);
      }

      if (parsed === null) {
        const message = friendlyHttpError(resp.status, isMarkupResponse, fallbackError);
        if (attempt < retries) {
          lastError = new Error(message);
          await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs * (attempt + 1)));
          continue;
        }
        throw new Error(message);
      }

      return parsed as T;
    } catch (err) {
      const sanitizedMsg = sanitizeApiErrorMessage(err, fallbackError);
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof Error &&
          /failed to fetch|networkerror|load failed|aborted/i.test(err.message));

      if (isNetworkError && attempt < retries) {
        lastError = new Error(sanitizedMsg);
        await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs * (attempt + 1)));
        continue;
      }

      throw new Error(sanitizedMsg);
    }
  }

  throw lastError ?? new Error(fallbackError);
}
