import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// X-Plane-Signature is exactly 64 hex characters (HMAC-SHA256), no prefix
const SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * Verify Plane webhook signature (X-Plane-Signature: bare hex HMAC-SHA256 of the raw body)
 */
function verifyPlaneWebhook(rawBody: Buffer, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !SIGNATURE_PATTERN.test(signature) || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(rawBody)
    .digest();
  // Hex is case-insensitive; the alphabet and length were validated above
  const received = Buffer.from(signature.toLowerCase(), 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Plane's docs show one work item example whose `event` holds an enum label
// instead of `workitem.updated`
const EVENT_ALIASES: Record<string, string> = {
  'WebhookScope.ScopeChoices.WORK_ITEM_UPDATED': 'workitem.updated',
};

export async function POST(request: NextRequest) {
  const secret = process.env.PLANE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PLANE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, exactly as received, for any content type
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-plane-signature');

  if (!verifyPlaneWebhook(rawBody, signature, secret)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification, then treat every field as untrusted
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(payload) || typeof payload.event !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const event = EVENT_ALIASES[payload.event] ?? payload.event;
  const data: JsonObject = isObject(payload.data) ? payload.data : {};
  const name = typeof data.name === 'string' ? data.name : undefined;

  // event_id is stable across retries; delivery_id changes on every attempt
  console.log(`Received ${event} event (event_id: ${payload.event_id}, delivery: ${payload.delivery_id})`);

  switch (event) {
    case 'workitem.created':
      console.log('Work item created:', name);
      // TODO: Sync to your tracker, notify a channel, etc.
      break;

    case 'workitem.updated': {
      const changed = isObject(payload.previous_attributes) ? Object.keys(payload.previous_attributes) : [];
      console.log(`Work item updated: ${name} (changed: ${changed.join(', ') || 'none'})`);
      // TODO: React to state or assignee changes, etc.
      break;
    }

    case 'workitem.deleted':
      console.log('Work item deleted:', payload.entity_id);
      // TODO: Remove the work item from your own records
      break;

    case 'workitem.comment.created': {
      const comment: JsonObject = isObject(data.comment) ? data.comment : {};
      const text = typeof comment.comment_stripped === 'string' ? comment.comment_stripped : undefined;
      console.log(`Comment on "${name}":`, text);
      // TODO: Bot commands, notifications, etc.
      break;
    }

    case 'project.updated':
      console.log('Project updated:', name);
      // TODO: Refresh cached project details
      break;

    case 'cycle.created':
      console.log('Cycle created:', name);
      // TODO: Announce the new cycle, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  return NextResponse.json({ received: true });
}
