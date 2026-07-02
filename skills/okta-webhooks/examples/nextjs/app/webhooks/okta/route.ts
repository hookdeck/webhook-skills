// Generated with: okta-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const OKTA_WEBHOOK_SECRET = process.env.OKTA_WEBHOOK_SECRET;

interface OktaLogEvent {
  uuid?: string;
  eventType: string;
  displayMessage?: string;
  actor?: { alternateId?: string };
  target?: Array<{ alternateId?: string }>;
}

interface OktaEventHookPayload {
  eventType?: string;
  data?: { events?: OktaLogEvent[] };
}

/**
 * Timing-safe comparison of the Authorization header against the shared secret.
 * Okta Event Hooks have no HMAC signature — auth is a static Authorization value.
 */
function isAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  const a = Buffer.from(authHeader || '', 'utf8');
  const b = Buffer.from(secret || '', 'utf8');
  // Length check first: crypto.timingSafeEqual throws on unequal-length buffers.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Dispatch on the System Log event type at data.events[].eventType. */
function handleEvent(event: OktaLogEvent): void {
  switch (event.eventType) {
    case 'user.lifecycle.create':
      console.log('User created:', event.target?.[0]?.alternateId);
      // TODO: provision downstream account, send welcome flow, etc.
      break;
    case 'user.session.start':
      console.log('User signed in:', event.actor?.alternateId);
      // TODO: audit logging, anomaly detection, etc.
      break;
    case 'user.account.lock':
      console.log('Account locked:', event.target?.[0]?.alternateId);
      // TODO: security alerting, notify the user, etc.
      break;
    case 'group.user_membership.add':
      console.log('User added to group:', event.target?.map((t) => t.alternateId));
      // TODO: sync entitlements, update downstream roles, etc.
      break;
    default:
      console.log('Unhandled event type:', event.eventType);
  }
}

/**
 * One-time verification handshake.
 * Okta sends a GET with the x-okta-verification-challenge header; echo it back.
 */
export async function GET(request: NextRequest) {
  const challenge = request.headers.get('x-okta-verification-challenge');
  return NextResponse.json({ verification: challenge });
}

/**
 * Event delivery. Okta POSTs a JSON payload with data.events[].
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request.headers.get('authorization'), OKTA_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: OktaEventHookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = payload?.data?.events;
  if (!Array.isArray(events)) {
    return NextResponse.json(
      { error: 'Invalid payload: missing data.events[]' },
      { status: 400 }
    );
  }

  // A single POST may carry multiple events.
  for (const event of events) {
    handleEvent(event);
  }

  return NextResponse.json({ received: true });
}
