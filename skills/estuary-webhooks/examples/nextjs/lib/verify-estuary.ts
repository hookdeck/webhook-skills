// Generated with: estuary-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type EstuaryAuthConfig = Record<string, string | undefined>;

// Hashing both sides gives equal-length buffers, so timingSafeEqual never throws.
const digest = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest();

/**
 * Estuary does not sign requests. You add a secret header to the materialization
 * trigger (or the HTTP Webhook connector's custom headers). The header name is yours,
 * so it comes from ESTUARY_WEBHOOK_HEADER (default Authorization). The WHOLE value is
 * compared with ESTUARY_WEBHOOK_SECRET: a "Bearer " prefix is not stripped or parsed.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyEstuaryRequest(
  headers: Headers,
  config: EstuaryAuthConfig = process.env
): boolean {
  const expected = config.ESTUARY_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured
  const name = config.ESTUARY_WEBHOOK_HEADER || 'Authorization';
  const received = headers.get(name); // Headers is case-insensitive
  if (!received) return false;
  return crypto.timingSafeEqual(
    digest(Buffer.from(received, 'latin1')),
    digest(Buffer.from(expected, 'utf8'))
  );
}

export type EstuaryKind = 'trigger' | 'documents' | 'empty';

/**
 * There is no vendor event field. The HTTP Webhook connector POSTs a JSON array of
 * documents from one binding; a trigger body is whatever its payloadTemplate renders,
 * so its keys are the ones you chose (Estuary's example uses materialization and runId).
 */
export function classify(payload: unknown): EstuaryKind {
  if (payload === null) return 'empty';
  if (Array.isArray(payload)) return 'documents';
  return 'trigger';
}
