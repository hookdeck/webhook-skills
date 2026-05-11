// Generated with: mailgun-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

interface MailgunSignature {
  timestamp: string;
  token: string;
  signature: string;
  'parent-signature'?: string;
}

interface MailgunEventData {
  event: string;
  recipient?: string;
  severity?: 'permanent' | 'temporary';
  url?: string;
  reject?: { reason?: string; description?: string };
  storage?: { url?: string; key?: string };
  [key: string]: unknown;
}

interface MailgunPayload {
  signature: MailgunSignature;
  'event-data': MailgunEventData;
}

/**
 * Verify a Mailgun signature object.
 * The signed content is `timestamp + token` (no separator), hashed with HMAC-SHA256.
 */
function verifyMailgun(signature: MailgunSignature, signingKey: string): boolean {
  if (!signature) return false;

  const { timestamp, token, signature: providedSig } = signature;
  if (!timestamp || !token || !providedSig) return false;

  const expected = createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(providedSig, 'hex')
    );
  } catch {
    return false;
  }
}

function verifyParentSignature(
  signature: MailgunSignature,
  parentSigningKey: string
): boolean {
  const parentSig = signature['parent-signature'];
  if (!parentSig) return true;  // not a subaccount event — nothing to verify

  const expected = createHmac('sha256', parentSigningKey)
    .update(signature.timestamp + signature.token)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(parentSig, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.error('MAILGUN_WEBHOOK_SIGNING_KEY not configured');
    return NextResponse.json(
      { error: 'Webhook verification not configured' },
      { status: 500 }
    );
  }

  let payload: MailgunPayload;
  try {
    payload = (await request.json()) as MailgunPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const signature = payload?.signature;
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature in request body' },
      { status: 400 }
    );
  }

  if (!verifyMailgun(signature, signingKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Optional subaccount parent-signature verification
  const parentKey = process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY;
  if (signature['parent-signature'] && parentKey) {
    if (!verifyParentSignature(signature, parentKey)) {
      return NextResponse.json({ error: 'Invalid parent-signature' }, { status: 400 });
    }
  }

  const eventData = payload['event-data'];
  if (!eventData || !eventData.event) {
    return NextResponse.json({ error: 'Missing event-data' }, { status: 400 });
  }

  switch (eventData.event) {
    case 'accepted':
      console.log(`Accepted: ${eventData.recipient}`);
      break;

    case 'rejected':
      console.log(`Rejected: ${eventData.recipient} - ${eventData.reject?.reason}`);
      break;

    case 'delivered':
      console.log(`Delivered: ${eventData.recipient}`);
      // Mark message as delivered in your database
      break;

    case 'failed':
      // severity is 'permanent' (hard bounce) or 'temporary' (soft bounce)
      console.log(`Failed (${eventData.severity}): ${eventData.recipient}`);
      if (eventData.severity === 'permanent') {
        // Add address to your local suppression list
      }
      break;

    case 'opened':
      console.log(`Opened: ${eventData.recipient}`);
      break;

    case 'clicked':
      console.log(`Clicked: ${eventData.recipient} -> ${eventData.url}`);
      break;

    case 'unsubscribed':
      console.log(`Unsubscribed: ${eventData.recipient}`);
      break;

    case 'complained':
      console.log(`Complained (spam): ${eventData.recipient}`);
      break;

    case 'stored':
      console.log(`Stored inbound message at ${eventData.storage?.url}`);
      break;

    case 'list_member_uploaded':
      console.log('List member uploaded');
      break;

    default:
      console.log(`Unhandled event type: ${eventData.event}`);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: '/webhooks/mailgun' });
}
