// Generated with: paylocity-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Paylocity signs each webhook with two headers:
//   x-pcty-timestamp: <unix seconds>
//   x-pcty-signature: keyId=<uuid>:signature=<hex>[,keyId=<uuid>:signature=<hex>]
// Each signature is hex(HMAC-SHA256(base64Decode(secret), "<timestamp>.<raw body>")).
// While a subscription has two active keys, every delivery carries one pair per
// key, so a single stored secret matches one of them.

/**
 * The secret is issued base64-encoded: the HMAC key is its decoded bytes.
 * Node's base64 decoder skips characters it doesn't know and ignores stray
 * bits, so insist on canonical base64 instead of keying with the wrong bytes.
 * Surrounding whitespace (a pasted trailing newline) is trimmed.
 */
export function decodeBase64Secret(secret: string | undefined | null): Buffer | null {
  const value = String(secret ?? '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length === 0) return null;
  if (key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null;
  return key;
}

/** Constant-time comparison of two byte buffers that may differ in length. */
function bytesEqual(given: Buffer, expected: Buffer): boolean {
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export interface PaylocitySignature {
  keyId: string;
  signature: string;
}

/** Split x-pcty-signature into its keyId/signature pairs. */
export function parsePaylocitySignatures(header: string | null | undefined): PaylocitySignature[] {
  return String(header ?? '')
    .split(',')
    .map((pair) => /^\s*keyId=([^:,\s]+):signature=((?:[0-9a-fA-F]{2})+)\s*$/.exec(pair))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ keyId: match[1], signature: match[2] }));
}

/**
 * toleranceSeconds > 0 turns on Paylocity's recommended age check (300 seconds);
 * it is off by default.
 */
export function verifyPaylocityWebhook(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined,
  { toleranceSeconds = 0, now = Date.now() / 1000 }: { toleranceSeconds?: number; now?: number } = {}
): boolean {
  const key = decodeBase64Secret(secret);
  if (!key || !signatureHeader || !timestamp) return false;
  if (toleranceSeconds > 0) {
    const age = Math.abs(now - Number(timestamp));
    if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  }
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${timestamp}.`, 'utf8')
    .update(rawBody)
    .digest();
  // Accept the delivery if any pair matches: during rotation one is signed with each key.
  return parsePaylocitySignatures(signatureHeader).some(({ signature }) =>
    bytesEqual(Buffer.from(signature, 'hex'), expected)
  );
}

/** CloudEvents-style envelope. The data fields depend on the event type. */
export interface PaylocityEvent {
  id?: string;
  type?: string;
  time?: string;
  data?: unknown;
  [key: string]: unknown;
}

export function handleEvent(payload: unknown, _rawBody?: Buffer): { received: true; type: string | null } {
  const { id, type } = (payload && typeof payload === 'object' ? payload : {}) as PaylocityEvent;
  switch (type) {
    case 'employee.assignment.v1':
      console.log(`Paylocity assignment change ${id}`);
      break;
    case 'employee.assignment.status.v1':
      console.log(`Paylocity assignment status change ${id}`);
      break;
    default:
      console.log(`Paylocity ${type} event ${id}`);
  }
  // Delivery is at least once: use id to skip duplicates.
  return { received: true, type: type ?? null };
}

/** PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS, or 0 (no age check). */
export function toleranceSeconds(): number {
  return Number(process.env.PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS) || 0;
}
