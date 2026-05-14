// Generated with: knock-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

type VerifyResult = { valid: true } | { valid: false; error: string };

/**
 * Verify the x-knock-signature header.
 *
 * Header format: t=<timestamp_ms>,s=<base64_signature>
 * Signed content: `${timestamp_ms}.${raw_body}`
 * Algorithm:      HMAC-SHA256 with the per-endpoint signing secret, base64.
 *
 * NOTE: Knock's timestamp is in MILLISECONDS (Stripe's looks identical but uses
 * seconds). Anyone porting a Stripe verifier will silently fail without this fix.
 */
export function verifyKnockSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceMs: number = FIVE_MINUTES_MS
): VerifyResult {
  if (!header) {
    return { valid: false, error: 'Missing x-knock-signature header' };
  }

  const parts = header.split(',');
  const tPart = parts.find((p) => p.startsWith('t='));
  const sPart = parts.find((p) => p.startsWith('s='));
  const timestampMs = tPart ? tPart.slice(2) : null;
  const signature = sPart ? sPart.slice(2) : null;

  if (!timestampMs || !signature) {
    return { valid: false, error: 'Malformed x-knock-signature header' };
  }

  const ts = parseInt(timestampMs, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > toleranceMs) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampMs}.${rawBody}`)
    .digest('base64');

  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return { valid: false, error: 'Invalid signature' };
  }

  try {
    if (crypto.timingSafeEqual(a, b)) {
      return { valid: true };
    }
  } catch {
    // Length mismatch handled above.
  }
  return { valid: false, error: 'Invalid signature' };
}

interface KnockEvent {
  id: string;
  type: string;
  created_at?: string;
  data?: Record<string, unknown>;
  event_data?: Record<string, unknown> | null;
}

export async function POST(request: NextRequest) {
  // App Router does not pre-parse JSON; reading as text yields the raw body bytes
  // exactly as Knock sent them. Do not call request.json() before verifying.
  const rawBody = await request.text();
  const header = request.headers.get('x-knock-signature');

  const verification = verifyKnockSignature(
    rawBody,
    header,
    process.env.KNOCK_WEBHOOK_SECRET!
  );

  if (!verification.valid) {
    console.error('Knock webhook verification failed:', verification.error);
    return NextResponse.json(
      { error: `Webhook Error: ${verification.error}` },
      { status: 400 }
    );
  }

  let event: KnockEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // Knock delivers at-least-once and retries up to 8 times — use event.id
  // as the idempotency key in real handlers.
  switch (event.type) {
    case 'message.sent':
      console.log('Message sent:', event.data?.id);
      break;
    case 'message.delivered':
      console.log('Message delivered:', event.data?.id);
      break;
    case 'message.delivery_attempted':
      console.log('Delivery attempted:', event.data?.id);
      break;
    case 'message.undelivered':
      console.log('Message undelivered:', event.data?.id);
      break;
    case 'message.bounced':
      console.log('Message bounced:', event.data?.id);
      break;
    case 'message.seen':
      console.log('Message seen:', event.data?.id);
      break;
    case 'message.unseen':
      console.log('Message unseen:', event.data?.id);
      break;
    case 'message.read':
      console.log('Message read:', event.data?.id);
      break;
    case 'message.unread':
      console.log('Message unread:', event.data?.id);
      break;
    case 'message.archived':
      console.log('Message archived:', event.data?.id);
      break;
    case 'message.unarchived':
      console.log('Message unarchived:', event.data?.id);
      break;
    case 'message.interacted':
      console.log('Message interacted:', event.data?.id);
      break;
    case 'message.link_clicked':
      console.log('Link clicked:', event.data?.id, event.event_data?.url);
      break;
    case 'workflow.updated':
    case 'workflow.committed':
      console.log(`Workflow ${event.type.split('.')[1]}:`, event.data?.key);
      break;
    case 'email_layout.updated':
    case 'email_layout.committed':
      console.log(`Email layout ${event.type.split('.')[1]}:`, event.data?.key);
      break;
    case 'translation.updated':
    case 'translation.committed':
      console.log(
        `Translation ${event.type.split('.')[1]}:`,
        event.data?.locale_code
      );
      break;
    case 'source_event_action.updated':
    case 'source_event_action.committed':
      console.log(
        `Source event action ${event.type.split('.')[1]}:`,
        event.data?.key
      );
      break;
    case 'partial.updated':
    case 'partial.committed':
      console.log(`Partial ${event.type.split('.')[1]}:`, event.data?.key);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
