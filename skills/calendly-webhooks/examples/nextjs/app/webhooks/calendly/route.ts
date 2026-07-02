// Generated with: calendly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY!;
// Reject timestamps older than this (seconds) to prevent replay attacks
const TOLERANCE_SECONDS = 180;

/**
 * Verify a Calendly webhook signature.
 *
 * Calendly sends a `Calendly-Webhook-Signature` header formatted as
 * `t=<timestamp>,v1=<signature>`. The signature is HMAC-SHA256 (hex) over
 * `{timestamp}.{raw body}` using the subscription's signing key.
 */
export function verifyCalendlySignature(
  rawBody: string,
  header: string | null,
  signingKey: string,
  toleranceSec: number = TOLERANCE_SECONDS
): boolean {
  if (!header) return false;

  // Parse "t=...,v1=..." into { t, v1 }
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.split('=') as [string, string])
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Replay protection: reject stale timestamps
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSec) return false;

  // Signed content is "{timestamp}.{raw body}" — use the raw body, not parsed JSON
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Timing-safe comparison (returns false on length mismatch instead of throwing)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification — do not parse JSON first
  const rawBody = await request.text();
  const header = request.headers.get('calendly-webhook-signature');

  if (!header) {
    return NextResponse.json(
      { error: 'Missing Calendly-Webhook-Signature header' },
      { status: 400 }
    );
  }

  if (!verifyCalendlySignature(rawBody, header, SIGNING_KEY)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Signature is valid — safe to parse the event
  const event = JSON.parse(rawBody);

  switch (event.event) {
    case 'invitee.created':
      console.log('Invitee scheduled:', event.payload?.email);
      // TODO: Create CRM record, send confirmation, provision resources, etc.
      break;

    case 'invitee.canceled':
      console.log('Invitee canceled:', event.payload?.email);
      // TODO: Free up availability, trigger win-back flow, update CRM, etc.
      break;

    case 'invitee_no_show.created':
      console.log('Invitee marked as no-show:', event.payload?.invitee);
      // TODO: Flag account, send follow-up, adjust scoring, etc.
      break;

    case 'routing_form_submission.created':
      console.log('Routing form submitted:', event.payload?.uri);
      // TODO: Qualify/route leads, sync to marketing tools, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event.event}`);
  }

  // Return 2xx to acknowledge receipt
  return NextResponse.json({ received: true });
}
