// Generated with: threads-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

/**
 * Verify a Threads (Meta) webhook signature.
 *
 * Meta sends X-Hub-Signature-256: sha256=<hex>, the HMAC-SHA256 hex digest of
 * the RAW request body keyed with the app secret. The pattern check guarantees
 * exactly 64 hex characters, then both sides are compared as equal-length
 * lowercase hex strings.
 */
function verifyThreadsSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const match = SIGNATURE_PATTERN.exec(signatureHeader);
  if (!match) {
    return false;
  }

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(match[1].toLowerCase(), 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}

interface ThreadsNotification {
  app_id?: string;
  topic?: string;
  target_id?: string;
  time?: number;
  subscription_id?: string;
  values?: { field?: string; value?: Record<string, any> };
}

/**
 * Dispatch one notification. Threads sends a flat object:
 * { app_id, topic, target_id, time, subscription_id, values: { field, value } }
 */
function handleNotification(notification: ThreadsNotification): void {
  const field = notification.values?.field;
  const value = notification.values?.value || {};

  switch (field) {
    case 'replies':
      console.log(`Reply ${value.id} by @${value.username} to post ${value.replied_to?.id}`);
      // TODO: Moderate or respond to the reply.
      break;
    case 'mentions':
      console.log(`Mention in post ${value.id} by @${value.username}`);
      // TODO: Social listening / alerts.
      break;
    case 'publish':
      console.log(`Post ${value.id} published by @${value.username}`);
      // TODO: Sync published posts.
      break;
    case 'delete':
      console.log(`Post ${value.id} deleted at ${value.deleted_at}`);
      // TODO: Remove the post from your own store.
      break;
    default:
      console.log(`Unhandled Threads field: ${field}`);
  }
}

// Constant-time compare for the GET handshake's hub.verify_token.
function verifyTokenMatches(token: string | null, expected: string | undefined): boolean {
  if (!token || !expected) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GET verification handshake: Meta sends this when the Callback URL is saved.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && verifyTokenMatches(token, process.env.THREADS_VERIFY_TOKEN)) {
    // Echo the challenge back verbatim as plain text.
    return new NextResponse(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST event delivery: read the raw body for signature verification.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyThreadsSignature(rawBody, signature, process.env.THREADS_APP_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification.
  let notification: ThreadsNotification;
  try {
    notification = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`Received Threads ${notification.topic} notification`);
  handleNotification(notification);

  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
