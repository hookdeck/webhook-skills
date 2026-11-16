// Generated with: prive-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Every payload is {topic, idempotencyKey, data}, so the body names its topic.
// Each webhook also subscribes to one topic, so a path per topic works as a
// second check. Map path slug -> topic.
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
      console.log('Subscription created:', payload?.data?.id);
      break;
    case 'subscriptions/line_removed':
      console.log('Subscription line removed:', payload?.data?.id);
      break;
    case 'subscriptions/status/updated':
      console.log('Subscription status updated:', payload?.data?.id);
      break;
    case 'orders/created':
      console.log('Order created:', payload?.data?.id);
      break;
    case 'billingAttempts/created':
      console.log('Billing attempt created:', payload?.data?.id);
      break;
    case 'billingAttempts/success':
      console.log('Billing attempt succeeded:', payload?.data?.id);
      break;
    case 'billingAttempts/failed':
      console.log('Billing attempt failed:', payload?.data?.id);
      break;
    case 'paymentMethod/updated':
      console.log('Payment method updated:', payload?.data?.id);
      break;
    case 'subscriptionActivities/created':
      console.log('Subscription activity created:', payload?.data?.id);
      break;
    case 'subscription/customAttributes/updated':
      console.log('Subscription custom attributes updated:', payload?.data?.id);
      break;
    default:
      console.log('Unhandled topic:', topic);
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

  // 3. Dispatch on the body's topic; a per-topic path must agree with it
  const bodyTopic = (payload as any)?.topic as string | undefined;
  if (topic && bodyTopic && bodyTopic !== topic) {
    return Response.json({ error: 'Topic does not match path' }, { status: 400 });
  }
  handleEvent(bodyTopic ?? topic, payload);

  return Response.json({ received: true });
}
