// Generated with: autumn-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// Autumn delivers webhooks through Svix:
//   svix-id         message ID (same across retries)
//   svix-timestamp  Unix seconds when the message was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

export interface AutumnEvent {
  type: string; // e.g. "billing.updated"
  data?: Record<string, any>;
  id?: string; // top-level on auto top-up events
  occurred_at?: number;
  [key: string]: any;
}

export type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Manual verifier (same algorithm as svix). Use it when the svix library's fixed
 * 5-minute timestamp window is a problem: Hookdeck retries and replays resend the
 * original svix-timestamp. Checks every `v1,` entry in constant time.
 *
 * @param toleranceSeconds window in seconds, or null for no window
 */
export function verifyManually(
  rawBody: string,
  headers: SvixHeaders,
  secret: string,
  toleranceSeconds: number | null = null
): boolean {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  if (toleranceSeconds !== null && Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest('base64')
  );

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const candidate = Buffer.from(sig);
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

/** AUTUMN_TIMESTAMP_TOLERANCE_SECONDS: unset -> svix library, "off" -> no window, N -> N seconds. */
function manualToleranceFromEnv(): number | null | undefined {
  const raw = (process.env.AUTUMN_TIMESTAMP_TOLERANCE_SECONDS || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'off') return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Verify an Autumn delivery, then parse it.
 * Default: the official svix library (5-minute window, constant-time compare).
 * svix 2.x `verify()` returns nothing and throws on failure, so the JSON is
 * parsed here after verification succeeds.
 */
export function verifyAutumnWebhook(rawBody: string, headers: SvixHeaders, secret: string): AutumnEvent {
  const tolerance = manualToleranceFromEnv();
  if (tolerance === undefined) {
    new Webhook(secret).verify(rawBody, headers);
  } else if (!verifyManually(rawBody, headers, secret, tolerance)) {
    throw new Error('No matching signature found');
  }
  return JSON.parse(rawBody) as AutumnEvent;
}

export function handleEvent(event: AutumnEvent): void {
  const { type } = event;
  const data = event.data ?? {};

  switch (type) {
    // customer.products.updated is the older name for plan changes.
    case 'billing.updated':
    case 'customer.products.updated': {
      for (const change of data.plan_changes ?? []) {
        const plan = (change.subscription ?? change.purchase)?.plan_id;
        console.log(`Plan ${change.action}: ${plan} for ${data.customer_id}${data.entity_id ? `/${data.entity_id}` : ''}`);
        if (change.previous_attributes?.canceled_at === null) {
          console.log(`Cancellation set for ${data.customer_id}; deprovision when the plan expires`);
        }
      }
      if (data.tags?.includes('trial_ended')) {
        console.log(`Trial ended for ${data.customer_id}`);
      }
      break;
    }
    case 'balances.limit_reached':
      console.log(`Limit reached (${data.limit_type}) on ${data.feature_id} for ${data.customer_id}`);
      break;
    case 'balances.usage_alert_triggered':
      console.log(`Usage alert "${data.usage_alert?.name}" on ${data.feature_id} for ${data.customer_id}`);
      break;
    case 'billing.auto_topup_succeeded':
      console.log(`Auto top-up granted ${data.quantity_granted} ${data.feature_id} to ${data.customer_id} (balance ${data.balance_after})`);
      break;
    case 'billing.auto_topup_failed':
      console.log(`Auto top-up failed (${data.reason}) for ${data.customer_id} on ${data.feature_id}`);
      break;
    case 'invoice.finalized':
      // The invoice fields are in `data`; fall back to the body for safety.
      console.log(`Invoice finalized: ${data.stripe_id ?? event.stripe_id} for ${data.customer_id ?? event.customer_id}`);
      break;
    default:
      console.log(`Unhandled Autumn event type: ${type}`);
  }
}
