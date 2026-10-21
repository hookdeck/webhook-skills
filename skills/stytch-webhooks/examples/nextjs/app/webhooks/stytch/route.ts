// Generated with: stytch-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { stytchEventType, type StytchEvent } from '../../../lib/stytch';

export const dynamic = 'force-dynamic';

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set STYTCH_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.STYTCH_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`STYTCH_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Svix-signed delivery (the Standard Webhooks scheme) and throw if it's invalid.
 *
 * Written out rather than calling the `svix` SDK, because the SDK always enforces a
 * 5-minute timestamp window. Hookdeck retries and replays carry the original
 * svix-timestamp, so that window would reject them. Here the window is opt-in via
 * STYTCH_TIMESTAMP_TOLERANCE_SECONDS.
 */
function verifySvixSignature(
  rawBody: string | Buffer,
  headers: Record<string, string | null | undefined>,
  secret: string,
  toleranceSeconds: number = timestampToleranceSeconds()
): void {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing Svix signature headers');
  if (!/^\d+$/.test(timestamp)) throw new Error('Invalid svix-timestamp');
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  // Key = base64-decoded secret after the whsec_ prefix
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // svix-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
  const match = signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw new Error('No matching signature');
}

export async function POST(request: Request) {
  const secret = process.env.STYTCH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('STYTCH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Stytch (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature. The timestamp window is opt-in (STYTCH_TIMESTAMP_TOLERANCE_SECONDS).
    verifySvixSignature(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Stytch webhook verification failed:', message);
    const error = /outside tolerance/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: StytchEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = stytchEventType(event);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Stytch webhook ${svixId}: ${type}`);

  // Webhooks are unordered: treat them as a signal and re-fetch from the Stytch API
  switch (type) {
    case 'direct.user.create':
      console.log('User created:', event.id);
      break;
    case 'direct.user.update':
      console.log('User updated:', event.id);
      break;
    case 'direct.organization.create':
    case 'dashboard.organization.create':
      console.log('Organization created:', event.id);
      break;
    case 'direct.member.update':
    case 'scim.member.update':
      console.log('Member updated:', event.id);
      break;
    case 'direct.saml_connection.delete':
      // DELETE events carry only the id, no entity object
      console.log('SAML connection deleted:', event.id);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
