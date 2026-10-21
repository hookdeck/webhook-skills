// Generated with: appsflyer-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * APPSFLYER PUSH API AUTHENTICATION
 *
 * AppsFlyer does NOT sign payloads: no signature header, no HMAC, no timestamp.
 * You configure a custom authorization header (name + token) per app ID, and
 * AppsFlyer sends it on every request. Compare the full value in constant time.
 */

type Env = Record<string, string | undefined>;

/** Name of the header you configured in AppsFlyer (HTTP names are case-insensitive). */
export function headerName(env: Env = process.env): string {
  return (env.APPSFLYER_AUTH_HEADER_NAME || 'authorization').toLowerCase();
}

/** Constant-time compare of the received header value to the expected token. */
export function verifyAppsflyerToken(
  received: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The AppsFlyer event name lives in the record's `event_name` field. */
export function eventName(payload: any): string {
  return payload && typeof payload.event_name === 'string' ? payload.event_name : 'unknown';
}

/** No unique event ID exists: build an idempotency key from the record. */
export function idempotencyKey(payload: any): string {
  return [payload?.appsflyer_id, payload?.event_name, payload?.event_time].join('|');
}

export async function POST(request: NextRequest) {
  const expected = process.env.APPSFLYER_AUTH_TOKEN;

  // Fail closed on misconfiguration: 500, distinguishable from a bad credential.
  if (!expected) {
    console.error('APPSFLYER_AUTH_TOKEN is not set — refusing unauthenticated webhooks');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  const received = request.headers.get(headerName());
  if (!received) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  if (!verifyAppsflyerToken(received, expected)) {
    console.error('AppsFlyer authorization header mismatch');
    return NextResponse.json({ error: 'Invalid authorization header' }, { status: 401 });
  }

  // Authenticate first, parse second.
  let payload: any;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`✓ Authenticated AppsFlyer record: ${eventName(payload)}`);

  handleEvent(payload);

  return NextResponse.json({ received: true });
}

function handleEvent(payload: any) {
  // TODO: check idempotencyKey(payload) against your store and return if seen.
  switch (eventName(payload)) {
    case 'install':
      console.log(`📲 Install ${payload.appsflyer_id} for app ${payload.app_id}`);
      break;
    case 'af_purchase':
      console.log(`💰 Purchase from ${payload.appsflyer_id} at ${payload.event_time}`);
      break;
    case 'af_complete_registration':
      console.log(`📝 Registration from ${payload.appsflyer_id}`);
      break;
    default:
      // In-app event names are defined by your app.
      console.log(`In-app event ${eventName(payload)} from ${payload.appsflyer_id}`);
  }
}
