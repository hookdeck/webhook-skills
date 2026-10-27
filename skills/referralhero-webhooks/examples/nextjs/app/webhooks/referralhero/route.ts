// Generated with: referralhero-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextResponse } from 'next/server';

// X-ReferralHero-Signature is the bare, padded, standard-base64 HMAC-SHA256 of the raw body:
// 32 bytes -> 44 characters, 43 of [A-Za-z0-9+/] then "=".
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

function verifyReferralHeroSignature(
  rawBody: Buffer,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  // Validate the format first. Never Buffer.from(sig, 'base64'): it silently drops bad characters.
  if (!SIGNATURE_FORMAT.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  // Compare the base64 text exactly (case-sensitive), as Hookdeck does.
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Dispatch on the body's `response` field.
function handleEvent(event: { response?: string }): void {
  switch (event.response) {
    case 'new_registration':
      console.log('New subscriber registered');
      break;
    case 'subscriber_promoted':
      console.log('Subscriber promoted');
      break;
    case 'subscriber_updated':
    case 'subscriber_fields_updated': // what the docs' subscriber_updated example sends
      console.log('Subscriber fields updated');
      break;
    case 'subscriber_deleted':
      console.log('Subscriber deleted');
      break;
    case 'reward_unlocked':
      console.log('Reward unlocked');
      break;
    case 'reward_sent':
      console.log('Reward sent');
      break;
    default:
      console.log(`Unhandled ReferralHero event: ${event.response}`);
  }
}

export async function POST(request: Request) {
  const secret = process.env.REFERRALHERO_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('REFERRALHERO_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the exact bytes. Calling request.json() first would break verification.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-referralhero-signature');

  if (!verifyReferralHeroSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature check.
  let event: { response?: string };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
  } catch (err) {
    console.error('Error handling ReferralHero event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // ReferralHero wants 200 with a blank body; anything else counts as an error.
  return new Response(null, { status: 200 });
}
