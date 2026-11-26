// Generated with: clockify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Clockify doesn't sign webhook bodies. Every delivery carries the webhook's
// token (the "Signing secret", authToken in the API) in Clockify-Signature.
// Each webhook has its own token, so CLOCKIFY_WEBHOOK_SIGNING_SECRET takes a
// comma-separated list when several webhooks point at this endpoint.

/** The changed object itself (time entry, project, task, ...). No envelope. */
export interface ClockifyEntity {
  id?: string;
  name?: string;
  workspaceId?: string;
  [key: string]: unknown;
}

/** Constant-time string comparison that doesn't leak the length. */
function safeEqual(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/** Split the configured value into tokens (JWTs contain no commas). */
export function parseTokens(value: string | null | undefined): string[] {
  return String(value ?? '').split(',').map((token) => token.trim()).filter(Boolean);
}

/** Check Clockify-Signature against the configured webhook token(s). */
export function verifyClockifySignature(signature: string | null | undefined, tokens: string[]): boolean {
  const given = String(signature ?? '').trim();
  if (!given || tokens.length === 0) return false;
  let ok = false;
  for (const token of tokens) ok = safeEqual(given, token) || ok; // check every token
  return ok;
}

/** One event per webhook; clockify-webhook-event-type names it when present. */
export function handleClockifyEvent(eventType: string | null, entity: ClockifyEntity) {
  console.log(`Clockify ${eventType ?? 'event'} for ${entity.id}`);
  return { received: true, event_type: eventType, id: entity.id ?? null };
}
