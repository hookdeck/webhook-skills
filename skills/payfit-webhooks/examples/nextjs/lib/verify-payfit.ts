// Generated with: payfit-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// PayFit delivers webhooks through Svix. Signed content is
// `${svix-id}.${svix-timestamp}.${rawBody}`; svix-signature holds
// space-separated "v1,<base64 HMAC-SHA256>" entries; the key is the
// base64-decoded part of the whsec_ signing secret.

export interface PayfitEvent {
  type: string;
  data?: { companyId?: string; effectiveDate?: string; payrollMonth?: string };
}

export interface SvixHeaders {
  'svix-id'?: string | null;
  'svix-timestamp'?: string | null;
  'svix-signature'?: string | null;
}

/** "whsec_" + base64: the HMAC key is the decoded bytes, checked to be canonical base64. */
export function decodeSigningSecret(secret: string | null | undefined): Buffer | null {
  const value = String(secret ?? '').trim().replace(/^whsec_/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length === 0) return null;
  if (key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null;
  return key;
}

/** Verify a PayFit (Svix) delivery. toleranceSeconds is optional; null = no window. */
export function verifyPayfitWebhook(
  rawBody: Buffer | string,
  headers: SvixHeaders,
  secret: string | null | undefined,
  toleranceSeconds: number | null = null,
  nowSeconds: number = Date.now() / 1000
): boolean {
  const key = decodeSigningSecret(secret);
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatures = headers['svix-signature'];
  if (!key || !id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (toleranceSeconds !== null && Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;

  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();
  return signatures
    .trim()
    .split(/\s+/)
    .some((entry) => {
      const [version, signature] = entry.split(',');
      if (version !== 'v1' || !signature) return false;
      const given = Buffer.from(signature, 'base64');
      return given.length === expected.length && crypto.timingSafeEqual(given, expected);
    });
}

export function handlePayfitEvent(event: PayfitEvent) {
  const data = event.data ?? {};
  if (event.type === 'payroll.run') {
    console.log(`Company ${data.companyId} ran payroll for ${data.payrollMonth}`);
  } else {
    console.log(`PayFit event ${event.type} for company ${data.companyId}`);
  }
  return { received: true, type: event.type, company_id: data.companyId ?? null };
}
