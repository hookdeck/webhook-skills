// Generated with: requesty-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Requesty delivers webhooks with Standard Webhooks signatures:
//   webhook-id         unique message ID (alert `id`, or sample `request_id`);
//                      the same on every retry
//   webhook-timestamp  Unix seconds when the webhook was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the organisation's secret after its `whsec_` prefix.
// There is one signing secret per organisation (Admin Panel > Alerts); during
// a rotation grace period webhook-signature carries several v1 entries.
// Until the organisation has a secret, deliveries are unsigned and fail here.
// Hookdeck's Requesty source also accepts the svix-* header names when webhook-id
// is absent, so this handler does the same.
// ---------------------------------------------------------------------------

// Alerts are {id, type, data}; a sample request is {request_id, request, response}
// and has no `type`.
interface RequestyBody {
  id?: string;
  type?: string; // e.g. "org.balance.below_absolute"
  data?: Record<string, any>;
  request_id?: string;
  request?: Record<string, any>;
  response?: Record<string, any>;
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers: webhook-* first, svix-* when webhook-id is
 * absent. Returns them under the webhook-* names the library expects, or null
 * if any is missing.
 */
function resolveSignatureHeaders(headers: Headers): SignatureHeaders | null {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signature = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify a Requesty delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 */
function verifyRequestyWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.REQUESTY_WEBHOOK_SECRET as string
): RequestyBody {
  return new Webhook(secret).verify(rawBody, headers) as RequestyBody;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// webhook-id is the same on every retry (only the timestamp and signature change).
const processedMessageIds = new Set<string>();

/**
 * The event name. X-Requesty-Event is the only carrier both alerts and sample
 * requests share; alert bodies also carry a top-level `type` with the same value.
 */
function eventTypeOf(headerValue: string | null, body: RequestyBody): string {
  return headerValue || body.type || 'unknown';
}

function handleEvent(type: string, body: RequestyBody): void {
  const d = body.data || {};
  switch (type) {
    // --- Spending alerts: {id, type, data} ---------------------------------
    case 'user.budget.exceeded_percent':
      console.log(`User ${d.user_email} (${d.user_id}) reached ${Number(d.percentage_exceeded) * 100}% of their $${d.limit} budget (spend $${d.spend})`);
      break;
    case 'user.budget.exceeded_absolute':
      console.log(`User ${d.user_email} (${d.user_id}) passed the $${d.absolute_exceeded} spend threshold (spend $${d.spend})`);
      break;
    case 'group.budget.exceeded_percent':
      console.log(`Group ${d.group_name} (${d.group_id}) reached ${Number(d.percentage_exceeded) * 100}% of its $${d.limit} budget (spend $${d.spend})`);
      break;
    case 'org.balance.below_absolute':
      console.log(`Organisation ${d.org_id} balance $${d.current_balance} is below $${d.balance_threshold}`);
      break;
    case 'apikey.budget.exceeded_percent':
      console.log(`API key ${d.api_key_name} (${d.api_key_id}) reached ${Number(d.percentage_exceeded) * 100}% of its $${d.limit} budget (spend $${d.spend})`);
      break;
    case 'apikey.budget.exceeded_absolute':
      console.log(`API key ${d.api_key_name} (${d.api_key_id}) passed the $${d.absolute_exceeded} spend threshold (spend $${d.spend})`);
      break;

    // --- Sample requests: {request_id, request, response} (no `type`) ------
    case 'sample.request':
      console.log(`Sampled request ${body.request_id} (model ${body.request?.model}, tokens ${body.response?.usage?.total_tokens})`);
      break;

    default:
      // The documented list may not be exhaustive.
      console.log(`Unhandled Requesty event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.REQUESTY_WEBHOOK_SECRET) {
    console.error('REQUESTY_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = resolveSignatureHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: RequestyBody;
  try {
    event = verifyRequestyWebhook(rawBody, headers);
  } catch (err) {
    console.error('Requesty webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Delivery is retried (up to 3 times), so acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Requesty times out after 15 seconds per attempt. In production, enqueue
    // the event here and process it asynchronously.
    handleEvent(eventTypeOf(request.headers.get('x-requesty-event'), event), event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Requesty event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
