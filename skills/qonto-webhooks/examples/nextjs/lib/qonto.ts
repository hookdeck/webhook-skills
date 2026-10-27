// Generated with: qonto-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

const HEX64 = /^[0-9a-fA-F]{64}$/;

export interface QontoEvent {
  id?: string;
  type?: string; // subscription type, e.g. "v1/transactions"
  data?: { event?: string; id?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify X-Qonto-Signature: `t=<unix seconds>,v1=<hex>`.
 * MAC = HMAC-SHA256(key = secret as UTF-8 bytes, message = `<t>.<raw body bytes>`), lowercase hex.
 * The secret may start with `whsec_` but is NOT a Standard Webhooks secret:
 * the whole string is the key (nothing stripped, nothing base64-decoded).
 */
export function verifyQontoSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string,
  toleranceSeconds = 0
): VerifyResult {
  if (!header) return { valid: false, error: 'Missing X-Qonto-Signature header' };

  let t: string | null = null;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && t === null) t = value;
    else if (key === 'v1') candidates.push(value); // other keys (e.g. v0) are ignored
  }
  if (!t) return { valid: false, error: 'Missing t= in signature header' };
  if (candidates.length === 0) return { valid: false, error: 'Missing v1= in signature header' };

  if (toleranceSeconds > 0) {
    const ts = /^\d+$/.test(t) ? Number(t) : NaN;
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Signed message is bytes: t exactly as it appears in the header, ".", raw body bytes.
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${t}.`, 'utf8'), rawBody]))
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  // Validate length and alphabet before comparing; hex is case-insensitive.
  const wellFormed = candidates.filter((c) => HEX64.test(c));
  if (wellFormed.length === 0) return { valid: false, error: 'Malformed v1 signature' };

  const ok = wellFormed.some((c) => {
    const candBuf = Buffer.from(c.toLowerCase(), 'utf8');
    return candBuf.length === expectedBuf.length && crypto.timingSafeEqual(candBuf, expectedBuf);
  });
  return ok ? { valid: true } : { valid: false, error: 'Signature mismatch' };
}

// Dispatch on the top-level `type` (subscription type); `data.event` says what happened.
export function handleQontoEvent(event: QontoEvent): void {
  const data = event.data ?? {};
  const what = data.event;
  switch (event.type) {
    case 'v1/transactions':
      console.log(`Transaction ${what}: ${data.id} (${data.amount} ${data.currency}, ${data.status})`);
      break;
    case 'v1/cards':
      console.log(`Card ${what}: ${data.id} (${data.status})`);
      break;
    case 'v1/transfers':
      console.log(`Transfer ${what}: ${data.id} (${data.amount_currency} ${data.amount}, ${data.status})`);
      break;
    default:
      console.log(`Unhandled Qonto event: ${event.type} ${what ?? ''}`.trim());
  }
}
