// Generated with: 360learning-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// 360Learning delivers webhooks through Svix and signs them the Standard
// Webhooks way:
//   webhook-id         unique event ID, the same on every retry
//   webhook-timestamp  Unix seconds of this attempt
//   webhook-signature  space-separated "v1,<base64 HMAC-SHA256>" entries
//                      (two during the 24 hours after a secret rotation)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: the base64-DECODED signing secret of the subscription. Strip an
// optional whsec_ prefix first.
//
// 360Learning's own Node sample signs JSON.stringify(req.body). That only
// matches when re-serialising reproduces the exact bytes sent. Verify the raw
// body instead.
// ---------------------------------------------------------------------------

/** Most events: `{ type, timestamp (ms), data }`. */
export interface ThreeSixtyLearningEvent {
  type: string;
  timestamp: number;
  data: Record<string, any>;
}

/** The `xapi` and `xapi.started` subscriptions send an xAPI statement (no `type`). */
export interface XapiStatement {
  id: string;
  actor: Record<string, unknown>;
  verb: { id: string; display?: Record<string, string> };
  object: { id?: string; [key: string]: unknown };
  context?: Record<string, unknown>;
  timestamp: string;
}

export interface ThreeSixtyLearningSignatureHeaders {
  'webhook-id': string | null;
  'webhook-timestamp': string | null;
  'webhook-signature': string | null;
}

/**
 * Each subscription (one per event type) has its own secret. One route that
 * receives several subscriptions needs all of them, comma-separated.
 */
export function parseSecrets(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Verify a 360Learning delivery. `toleranceSeconds` is an optional freshness
 * window (null = off). 360Learning recommends one; a delivery replayed later
 * through a relay keeps its original timestamp, so a window rejects it.
 */
export function verify360LearningWebhook(
  rawBody: string | Buffer,
  headers: ThreeSixtyLearningSignatureHeaders,
  secrets: string | string[] | undefined,
  toleranceSeconds: number | null = null
): boolean {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  const secretList = (Array.isArray(secrets) ? secrets : [secrets]).filter(
    (s): s is string => Boolean(s)
  );
  if (!id || !timestamp || !signatureHeader || secretList.length === 0) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  }

  const given: Buffer[] = [];
  for (const entry of signatureHeader.trim().split(/\s+/)) {
    const [version, signature] = entry.split(',');
    if (version === 'v1' && signature) given.push(Buffer.from(signature, 'base64'));
  }

  let ok = false;
  for (const secret of secretList) {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    if (key.length === 0) continue;
    const expected = crypto
      .createHmac('sha256', key)
      .update(`${id}.${timestamp}.`)
      .update(rawBody)
      .digest();
    // Check every v1 entry: after a rotation one is signed with the new secret
    // and one with the old. Any match passes.
    for (const sig of given) {
      if (sig.length === expected.length && crypto.timingSafeEqual(sig, expected)) ok = true;
    }
  }
  return ok;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedEventIds = new Set<string>();

function handleEvent(payload: ThreeSixtyLearningEvent | XapiStatement): void {
  if (!('type' in payload) || typeof payload.type !== 'string') {
    const statement = payload as XapiStatement;
    if (statement.verb && statement.actor) {
      console.log(`xAPI statement ${statement.id}: ${statement.verb.id} ${statement.object?.id}`);
    } else {
      console.log('Unrecognised 360Learning payload');
    }
    return;
  }

  const event = payload as ThreeSixtyLearningEvent;
  const data = event.data ?? {};
  switch (event.type) {
    case 'user.created':
    case 'user.updated':
    case 'user.deleted':
    case 'user.activated':
    case 'user.invited':
    case 'user.reactivated':
      console.log(`${event.type}: user ${data.userId}`);
      break;
    case 'course.attempt.closed':
      console.log(`Attempt ${data.attemptId} on course ${data.courseId} closed (${data.reason})`);
      break;
    case 'path.session.user.status.updated':
      console.log(`User ${data.userId} is ${data.status} in session ${data.sessionId}`);
      break;
    case 'path.session.users.enrolled':
    case 'path.session.users.unenrolled':
      // No user IDs in the payload: call List all enrollments for the session.
      console.log(`${event.type}: session ${data.sessionId} of path ${data.pathId}`);
      break;
    case 'user.certificate.awarded':
      console.log(`Certificate ${data.certificateId} awarded to ${data.userId}`);
      break;
    case 'user.assessment.corrected':
      console.log(`Assessment ${data.assessmentId} for ${data.userId}: success=${data.success}`);
      break;
    case 'bulk.operation.ended':
      console.log(`Bulk operation ${data.bulkOperationId} (${data.type}) ${data.status}`);
      break;
    default:
      console.log(`Unhandled 360Learning event type: ${event.type}`);
  }
}

export async function POST(request: Request) {
  const secrets = parseSecrets(process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET);
  if (secrets.length === 0) {
    console.error('THREE_SIXTY_LEARNING_WEBHOOK_SECRET is not set: rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers: ThreeSixtyLearningSignatureHeaders = {
    'webhook-id': request.headers.get('webhook-id'),
    'webhook-timestamp': request.headers.get('webhook-timestamp'),
    'webhook-signature': request.headers.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Read the raw bytes: the signature covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = process.env.THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS
    ? Number(process.env.THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS)
    : null;
  if (!verify360LearningWebhook(rawBody, headers, secrets, tolerance)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: ThreeSixtyLearningEvent | XapiStatement;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // webhook-id is the same on every retry: acknowledge duplicates.
  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(payload);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling 360Learning event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
