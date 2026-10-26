// Generated with: qlik-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Qlik Cloud's docs don't name the HTTP method, so accept all the usual ones.
export const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Verify the qlik-signature header: the lowercase hex HMAC-SHA256 of the raw request
// body bytes, keyed with the webhook secret's UTF-8 bytes. No prefix, no timestamp.
export function verifyQlikSignature(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  secret: string | undefined = process.env.QLIK_CLOUD_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string') return false; // never accept when unconfigured
  // Validate the format first: exactly 64 hex characters (hex is case-insensitive).
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature.toLowerCase(), 'utf8'); // not Buffer.from(sig, 'hex')
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function handleEvent(payload: Record<string, unknown>): void {
  // After verification every field is still untrusted: check types before reading.
  // `type` is the CloudEvents type. Payloads from before the hybrid period (and the
  // legacy fields until December 10, 2026) carry the same value in `eventType`.
  const type = asString(payload.type) ?? asString(payload.eventType);
  const data = isObject(payload.data) ? payload.data : {};
  const attributes = isObject(data.attributes) ? data.attributes : {};
  const id = asString(data.id) ?? asString(data.appId) ?? asString(attributes.id);

  switch (type) {
    case 'com.qlik.v1.app.created':
      console.log('App created:', id);
      // TODO: register the new app in your catalog
      break;
    case 'com.qlik.v1.app.published':
      console.log('App published:', id);
      // TODO: refresh whatever depends on the published app
      break;
    case 'com.qlik.v1.app.deleted':
      console.log('App deleted:', id);
      // TODO: remove the app from your catalog
      break;
    case 'com.qlik.v1.app.reload.finished':
    case 'com.qlik.v1.reload.finished':
      console.log('Reload finished:', id, data.succeeded === true ? 'succeeded' : 'not reported as succeeded');
      // TODO: kick off downstream work if the reload succeeded, alert if it did not
      break;
    case 'com.qlik.v1.user.created':
      console.log('User created:', id);
      // TODO: provision the user in your own system
      break;
    case 'com.qlik.v1.user.deleted':
      console.log('User deleted:', id);
      // TODO: deprovision the user
      break;
    case 'com.qlik.v1.automation.created':
      console.log('Automation created:', id);
      // TODO: track the new automation
      break;
    case 'com.qlik.v1.automation.run.started':
      console.log('Automation run started:', id);
      // TODO: record the run
      break;
    case 'com.qlik.v1.api-key.validation.failed':
      console.log('API key validation failed');
      // TODO: alert the tenant admin
      break;
    default:
      console.log(`Unhandled Qlik Cloud event: ${type}`);
  }
}
