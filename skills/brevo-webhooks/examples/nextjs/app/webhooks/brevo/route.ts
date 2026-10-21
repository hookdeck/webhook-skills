// Generated with: brevo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

type BrevoCredentials = { username?: string; password?: string; token?: string };

// Brevo payloads vary by event family; these are the fields used below
type BrevoEvent = {
  event?: string;
  email?: string;
  link?: string; // transactional click
  URL?: string; // marketing click
  reason?: string;
  msg_status?: string; // SMS events carry msg_status instead of event
  [key: string]: unknown;
};

/**
 * Timing-safe string comparison that tolerates length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Authenticate a Brevo webhook request.
 *
 * Brevo does NOT sign webhook payloads (no HMAC/signature header). Instead the
 * webhook is created with one of:
 *   - Basic auth: credentials in the notify URL (https://user:pass@host/...),
 *     which Brevo sends as `Authorization: Basic base64(user:pass)`
 *   - Bearer token: `"auth": {"type": "bearer", "token": "..."}` on the
 *     webhook, sent as `Authorization: Bearer <token>`
 * Either configured method is accepted; credentials are compared timing-safe.
 */
export function verifyBrevoAuth(
  authHeader: string | null,
  { username, password, token }: BrevoCredentials = {}
): boolean {
  if (!authHeader) return false;

  if (token && authHeader.startsWith('Bearer ')) {
    return safeEqual(authHeader.slice(7), token);
  }

  if (username && password && authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const i = decoded.indexOf(':'); // split on the FIRST colon; passwords may contain ':'
    if (i === -1) return false;
    // Evaluate both comparisons so timing doesn't reveal which one failed
    const userOk = safeEqual(decoded.slice(0, i), username);
    const passOk = safeEqual(decoded.slice(i + 1), password);
    return userOk && passOk;
  }

  return false;
}

function handleBrevoEvent(event: BrevoEvent) {
  // `event` is the payload value (snake_case), not the camelCase name you
  // subscribe with (e.g. subscribe to `hardBounce`, receive `hard_bounce`).
  switch (event.event) {
    case 'request': // "Sent" (transactional)
      console.log(`Sent to ${event.email} (${event['message-id']})`);
      break;
    case 'delivered':
      console.log(`Delivered to ${event.email}`);
      // TODO: Mark message as delivered
      break;
    case 'opened':
    case 'unique_opened':
    case 'proxy_open':
    case 'unique_proxy_open':
      console.log(`${event.event} by ${event.email}`);
      // TODO: Track engagement (proxy_open = opened via a privacy proxy, e.g. Apple MPP)
      break;
    case 'click':
      console.log(`Click by ${event.email}: ${event.link || event.URL}`);
      break;
    case 'hard_bounce':
    case 'invalid_email':
    case 'blocked':
      console.log(`${event.event} for ${event.email}: ${event.reason || ''}`);
      // TODO: Suppress the address
      break;
    case 'soft_bounce':
    case 'deferred':
    case 'error':
      console.log(`${event.event} for ${event.email}: ${event.reason || ''}`);
      break;
    case 'spam':
      console.log(`Spam complaint from ${event.email}`);
      // TODO: Unsubscribe / suppress the address
      break;
    case 'unsubscribed': // transactional
    case 'unsubscribe': // marketing
      console.log(`Unsubscribed: ${event.email}`);
      // TODO: Update subscription preferences
      break;
    case 'list_addition':
    case 'contact_updated':
    case 'contact_deleted':
      console.log(`Contact event ${event.event}: ${event.email}`);
      // TODO: Sync contact to your system
      break;
    default:
      console.log(`Unhandled Brevo event: ${event.event ?? event.msg_status ?? 'unknown'}`);
  }
}

export async function POST(request: NextRequest) {
  const creds: BrevoCredentials = {
    username: process.env.BREVO_WEBHOOK_USERNAME,
    password: process.env.BREVO_WEBHOOK_PASSWORD,
    token: process.env.BREVO_WEBHOOK_TOKEN,
  };

  // Fail closed: without a configured credential there is nothing to check.
  if (!(creds.username && creds.password) && !creds.token) {
    console.error('Set BREVO_WEBHOOK_USERNAME/PASSWORD or BREVO_WEBHOOK_TOKEN');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  if (!verifyBrevoAuth(request.headers.get('authorization'), creds)) {
    console.error('Brevo webhook authentication failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // No body signature to protect, so ordinary JSON parsing is fine here.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Batched webhooks (`batched: true`) deliver an array; normal ones a single object
  const events = Array.isArray(body) ? body : [body];
  if (events.some((e) => !e || typeof e !== 'object')) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  for (const event of events as BrevoEvent[]) {
    handleBrevoEvent(event);
  }

  // Respond 2xx quickly; Brevo may retry on 5xx responses
  return NextResponse.json({ received: true });
}
