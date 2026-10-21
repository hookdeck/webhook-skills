// Generated with: gorgias-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { timingSafeEqual } from 'crypto';

/**
 * Gorgias HTTP integrations are NOT signed. You add a header to the
 * integration yourself (here `Authorization: Bearer <GORGIAS_WEBHOOK_SECRET>`)
 * and Gorgias sends it verbatim. Compare the WHOLE value in constant time.
 */
export function verifyGorgiasAuthorization(
  header: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!header || !secret) return false;
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(`Bearer ${secret}`, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && timingSafeEqual(a, b);
}

export type GorgiasPayload = Record<string, string | undefined>;

/**
 * Parse the rendered body template: application/json or
 * application/x-www-form-urlencoded. An empty body parses to {}.
 * Throws on invalid JSON.
 */
export function parseGorgiasBody(rawBody: string, contentType: string | null): GorgiasPayload {
  if (!rawBody.trim()) return {};
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }
  return JSON.parse(rawBody);
}

/**
 * Gorgias doesn't say which trigger fired: read the trigger key you hard-coded
 * in the template ("event": "ticket-created") or the URL (?event=...).
 */
export function eventName(payload: GorgiasPayload, searchParams: URLSearchParams): string {
  if (typeof payload.event === 'string') return payload.event;
  return searchParams.get('event') ?? 'unknown';
}
