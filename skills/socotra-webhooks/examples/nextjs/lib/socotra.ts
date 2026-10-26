import crypto from 'crypto';

/**
 * SOCOTRA WEBHOOK VERIFICATION
 *
 *   header    : socotra-signature: t=<unix ms>,v1=<hex>[,v1=<hex>...]
 *   algorithm : HMAC-SHA256, lowercase hex
 *   signed    : the t value exactly as sent (a string), ".", then the RAW body bytes
 *   key       : the endpoint `secret`, used as UTF-8 bytes
 *   tag       : leave the endpoint's `tag` unset. A tagged endpoint signs
 *               `{t}.{body}.{tag}`, which this check (and Hookdeck) cannot verify.
 */
const SIGNATURE_HEX = /^[0-9a-fA-F]{64}$/;

export interface SocotraEvent {
  locator?: string;
  requestId?: string;
  userLocator?: string;
  timestamp?: number;
  type?: string;
  data?: Record<string, unknown>;
}

/** Split `t=...,v1=...,v1=...` into the timestamp string and every v1 value. Other keys are ignored. */
export function parseSignatureHeader(header: string | null | undefined) {
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of String(header || '').split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && timestamp === undefined) timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  return { timestamp, signatures };
}

/**
 * Returns true only when ANY v1= entry equals HMAC-SHA256(secret, `${t}.` + rawBody).
 * `toleranceSeconds` is an optional max age for t (Unix milliseconds); 0 = off.
 */
export function verifySocotraSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string | undefined,
  toleranceSeconds = 0
): boolean {
  if (!header || !secret) return false;

  const { timestamp, signatures } = parseSignatureHeader(header);
  if (!timestamp || signatures.length === 0) return false;

  // Signed message as bytes: the t string as sent + "." + the raw body.
  const signedMessage = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedMessage).digest();

  let valid = false;
  for (const signature of signatures) {
    // Validate length and alphabet BEFORE decoding: Buffer.from(x, 'hex') silently drops bad characters.
    if (!SIGNATURE_HEX.test(signature)) continue;
    const received = Buffer.from(signature.toLowerCase(), 'hex');
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) {
      valid = true;
    }
  }
  if (!valid) return false;

  // Opt-in replay window. t is Unix MILLISECONDS.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() - Number(timestamp)) > toleranceSeconds * 1000) return false;
  }
  return true;
}

export function toleranceSeconds(): number {
  const value = Number(process.env.SOCOTRA_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
