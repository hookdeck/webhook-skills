// Generated with: rubrik-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// RUBRIK SECURITY CLOUD WEBHOOKS ARE NOT SIGNED. There is no HMAC and no
// signature header. The webhook carries a credential chosen with
// `authInfo.authType` (AuthenticationTypeV2):
//
//   CUSTOM_HEADER  -> <headerKey>: <headerValue>        (recommended)
//   BEARER         -> Authorization: Bearer <token>
//   BASIC          -> Authorization: Basic base64(user:pass)
//
// OAUTH2 and URL-token modes are not handled here. With no credentials
// configured every request is rejected (fail closed).
// ---------------------------------------------------------------------------

export type AuthMode = 'custom_header' | 'bearer' | 'basic';

type Env = Record<string, string | undefined>;

export const DEFAULT_HEADER_NAME = 'X-Rubrik-Webhook-Token';

/** Constant-time compare via fixed-length SHA-256 digests (never throws on length mismatch). */
export function secureEquals(a: string, b: string): boolean {
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(a, 'utf8').digest(),
    crypto.createHash('sha256').update(b, 'utf8').digest()
  );
}

function parseAuthorization(header: string | null): { scheme: string; value: string } | null {
  if (!header) return null;
  const match = /^(\S+)\s+(.+)$/.exec(header.trim());
  if (!match) return null;
  return { scheme: match[1].toLowerCase(), value: match[2].trim() };
}

function verifyBasic(authorization: string | null, username: string, password: string): boolean {
  const parsed = parseAuthorization(authorization);
  if (!parsed || parsed.scheme !== 'basic') return false;
  const decoded = Buffer.from(parsed.value, 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon === -1) return false;
  // Split on the FIRST colon only: passwords may contain colons.
  const userOk = secureEquals(decoded.slice(0, colon), username);
  const passOk = secureEquals(decoded.slice(colon + 1), password);
  return userOk && passOk;
}

/** Returns the auth mode that matched, or null if the request is unauthenticated. */
export function authenticateRequest(headers: Headers, env: Env = process.env): AuthMode | null {
  const secret = env.RUBRIK_WEBHOOK_SECRET;
  const headerName = env.RUBRIK_WEBHOOK_HEADER_NAME || DEFAULT_HEADER_NAME;
  const bearerToken = env.RUBRIK_WEBHOOK_BEARER_TOKEN;
  const username = env.RUBRIK_WEBHOOK_USERNAME;
  const authorization = headers.get('authorization');

  // CUSTOM_HEADER: compare the whole header value (Headers.get is case-insensitive).
  if (secret) {
    const value = headers.get(headerName);
    if (value !== null && secureEquals(value, secret)) return 'custom_header';
  }

  // BEARER: Authorization: Bearer <token>
  if (bearerToken) {
    const parsed = parseAuthorization(authorization);
    if (parsed && parsed.scheme === 'bearer' && secureEquals(parsed.value, bearerToken)) {
      return 'bearer';
    }
  }

  // BASIC: Authorization: Basic base64(username:password)
  if (username && verifyBasic(authorization, username, env.RUBRIK_WEBHOOK_PASSWORD || '')) {
    return 'basic';
  }

  return null;
}

export interface RubrikEvent {
  id?: string;
  activityType?: string;
  eventClass?: string;
  status?: string;
  severity?: string;
  message?: string;
  objectName?: string;
  objectType?: string;
  eventName?: string;
  clusterName?: string;
}

/**
 * Normalize the default PD-CEF payload ({ summary, severity, class, custom_details: {...} })
 * or a flat custom-template payload into one shape.
 */
export function normalizeEvent(payload: Record<string, any>): RubrikEvent {
  const details: Record<string, any> =
    payload.custom_details && typeof payload.custom_details === 'object' ? payload.custom_details : payload;
  return {
    id: details.id ?? payload.id,
    activityType: details.type ?? payload.type,
    eventClass: payload.class ?? details.class,
    status: details.status ?? payload.status,
    severity: payload.severity ?? details.severity,
    message: payload.summary ?? payload.message ?? details.message,
    objectName: details.objectName,
    objectType: details.objectType,
    eventName: details.eventName,
    clusterName: details.clusterName,
  };
}
