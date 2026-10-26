// Generated with: prive-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Prive documents no topic header or body field, so each webhook subscribes to
// one topic and gets its own endpoint path. Map path slug -> topic.
export const TOPICS: Record<string, string> = {
  'subscriptions-created': 'subscriptions/created',
  'subscriptions-line-removed': 'subscriptions/line_removed',
  'subscriptions-status-updated': 'subscriptions/status/updated',
  'orders-created': 'orders/created',
  'billing-attempts-created': 'billingAttempts/created',
  'billing-attempts-success': 'billingAttempts/success',
  'billing-attempts-failed': 'billingAttempts/failed',
  'payment-method-updated': 'paymentMethod/updated',
  'subscription-activities-created': 'subscriptionActivities/created',
  'subscription-custom-attributes-updated': 'subscription/customAttributes/updated',
};

/**
 * Verify a Prive webhook.
 *
 * `x-prive-hmac-sha256` is the bare base64 HMAC-SHA256 of the raw body, keyed
 * with the secret token Prive provides to the merchant. Compare the base64
 * strings as equal-length UTF-8 buffers (no lenient base64 decoding).
 */
export function verifyPriveSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!header || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on length mismatch, so check first
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function handleEvent(topic: string | undefined, payload: any) {
  switch (topic) {
    case 'subscriptions/created':
      console.log('Subscription created:', payload?.id);
      // TODO: onboarding, CRM sync, etc.
      break;
    case 'subscriptions/line_removed':
      console.log('Subscription line removed:', payload?.id);
      break;
    case 'subscriptions/status/updated':
      console.log('Subscription status updated:', payload?.id);
      // TODO: handle pause / cancel / reactivate
      break;
    case 'orders/created':
      console.log('Order created:', payload?.id);
      // TODO: sync to OMS, trigger fulfillment
      break;
    case 'billingAttempts/created':
      console.log('Billing attempt created:', payload?.id);
      break;
    case 'billingAttempts/success':
      console.log('Billing attempt succeeded:', payload?.id);
      // TODO: record revenue
      break;
    case 'billingAttempts/failed':
      console.log('Billing attempt failed:', payload?.id);
      // TODO: dunning, customer outreach
      break;
    case 'paymentMethod/updated':
      console.log('Payment method updated:', payload?.id);
      break;
    case 'subscriptionActivities/created':
      console.log('Subscription activity created:', payload?.id);
      break;
    case 'subscription/customAttributes/updated':
      console.log('Subscription custom attributes updated:', payload?.id);
      break;
    default:
      console.log('Webhook received (topic not identified by path)');
  }
}

/** Shared handler for the generic and per-topic routes. */
export async function receivePriveWebhook(
  request: Request,
  topic: string | undefined
): Promise<Response> {
  // Read the raw body as text - do NOT use request.json() before verifying.
  const body = await request.text();

  // 1. Verify first
  const verified = verifyPriveSignature(
    body,
    request.headers.get('x-prive-hmac-sha256'),
    process.env.PRIVE_WEBHOOK_SECRET
  );
  if (!verified) {
    console.error('Webhook signature verification failed');
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Parse only after verification
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 3. Dispatch on the topic implied by the endpoint path
  handleEvent(topic, payload);

  return Response.json({ received: true });
}
