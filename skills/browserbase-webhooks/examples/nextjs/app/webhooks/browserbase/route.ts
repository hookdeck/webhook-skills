// Generated with: browserbase-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Browserbase signs deliveries with Standard Webhooks:
//   webhook-id         unique message identifier
//   webhook-timestamp  Unix seconds when the delivery was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
//
// Browserbase returns the secret only when you create or rotate the webhook.
// ---------------------------------------------------------------------------

export interface BrowserbaseEvent {
  id: string; // stable across retries of the same event
  type: string; // e.g. "functions.invocations.completed"
  resourceId: string; // the invocation or build the event concerns
  data: Record<string, unknown>; // type-specific payload
}

type BrowserbaseHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Secrets to try, current first. After a rotation Browserbase keeps the
 * previous secret verifying for 24 hours, so
 * BROWSERBASE_WEBHOOK_SECRET_PREVIOUS is accepted too.
 */
function getSecrets(): string[] {
  return [
    process.env.BROWSERBASE_WEBHOOK_SECRET,
    process.env.BROWSERBASE_WEBHOOK_SECRET_PREVIOUS,
  ].filter((s): s is string => Boolean(s));
}

/**
 * Verify a Browserbase delivery with the official Standard Webhooks SDK. The
 * SDK checks the timestamp (5-minute tolerance), recomputes the HMAC over the
 * raw body, and compares in constant time against every `v1,` entry.
 * Throws if no configured secret verifies the delivery.
 */
function verifyBrowserbaseWebhook(
  rawBody: string,
  headers: BrowserbaseHeaders,
  secrets: string[] = getSecrets()
): BrowserbaseEvent {
  let lastError: unknown = new Error('No signing secret configured');
  for (const secret of secrets) {
    try {
      return new Webhook(secret).verify(rawBody, headers) as BrowserbaseEvent;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The envelope `id` is stable across retries of the same event.
const processedEventIds = new Set<string>();

function handleEvent(event: BrowserbaseEvent): void {
  // Envelope keys are additive, so ignore anything you don't recognize.
  const { type, resourceId } = event;

  switch (type) {
    // --- Function invocations (resourceId = invocation) ---------------------
    case 'functions.invocations.pending':
      console.log(`Invocation ${resourceId} queued`);
      break;
    case 'functions.invocations.running':
      console.log(`Invocation ${resourceId} running`);
      break;
    case 'functions.invocations.completed':
      // Terminal success: update your record, start downstream work.
      console.log(`Invocation ${resourceId} completed`);
      break;
    case 'functions.invocations.failed':
      // Terminal failure: alert, retry the invocation, or mark the job failed.
      console.log(`Invocation ${resourceId} failed`);
      break;

    // --- Function builds (resourceId = build) -------------------------------
    case 'functions.builds.running':
      console.log(`Build ${resourceId} running`);
      break;
    case 'functions.builds.completed':
      console.log(`Build ${resourceId} completed`);
      break;
    case 'functions.builds.failed':
      console.log(`Build ${resourceId} failed`);
      break;

    default:
      // Browserbase adds event types over time.
      console.log(`Unhandled Browserbase event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (getSecrets().length === 0) {
    console.error('BROWSERBASE_WEBHOOK_SECRET is not set, rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: BrowserbaseEvent;
  try {
    event = verifyBrowserbaseWebhook(rawBody, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    });
  } catch (err) {
    console.error('Browserbase webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Redelivery is normal (retries, or a response that arrived too late).
  if (processedEventIds.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Browserbase needs a 2xx within 15 seconds. In
    // production, store or enqueue the event here and process it afterwards.
    handleEvent(event);
    processedEventIds.add(event.id);
  } catch (err) {
    console.error('Error handling Browserbase event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
