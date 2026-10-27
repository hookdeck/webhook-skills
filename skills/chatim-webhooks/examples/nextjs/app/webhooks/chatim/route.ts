// Generated with: chatim-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Chatim sends X-Chatim-Signature: "sha256=<hex>" and X-Chatim-Timestamp (Unix seconds).
// The signature is HMAC-SHA256 (hex) of "<X-Chatim-Timestamp>.<raw body>" keyed with the webhook secret.
// https://chatim.app/en/documentation/webhooks/

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set CHATIM_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.CHATIM_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`CHATIM_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function verifyChatim(
  rawBody: Buffer,
  signatureHeader: string | null,
  timestampHeader: string | null,
  secret: string
): boolean {
  if (!secret || !signatureHeader || !timestampHeader) return false;

  // Accept "sha256=<hex>" or the bare digest; validate length and alphabet before decoding
  const hex = signatureHeader.startsWith('sha256=') ? signatureHeader.slice('sha256='.length) : signatureHeader;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  const received = Buffer.from(hex, 'hex');

  // Opt-in replay window; X-Chatim-Timestamp is Unix seconds
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestampHeader)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestampHeader)) > tolerance) return false;
  }

  // Signed message as bytes: timestamp header (latin1, untouched) + "." + raw body bytes
  const message = Buffer.concat([Buffer.from(timestampHeader, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export async function POST(request: NextRequest) {
  const secret = process.env.CHATIM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHATIM_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read the bytes before any JSON parsing
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (
    !verifyChatim(
      rawBody,
      request.headers.get('x-chatim-signature'),
      request.headers.get('x-chatim-timestamp'),
      secret
    )
  ) {
    // Chatim treats 4xx as a permanent failure (no retry), so only answer 4xx for a bad signature
    console.error('Chatim webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Use payload.eventId (or the X-Chatim-Delivery-Id header) for idempotency
  const data = payload.data || {};
  const visitor = data.visitor || {};

  switch (payload.event) {
    case 'chat.started':
      console.log(`Chat ${payload.chatUuid} started by ${visitor.name || visitor.uuid} on ${data.page?.url}`);
      break;
    case 'chat.message.received':
      console.log(`Message from ${visitor.name || visitor.uuid}: ${data.message}`);
      break;
    case 'chat.form.submitted':
      console.log(`Form "${data.formName}" submitted:`, data.fields);
      break;
    case 'chat.closed':
      console.log(`Chat ${payload.chatUuid} closed by ${data.closedBy} after ${data.duration}s`);
      break;
    case 'chat.assigned':
      console.log(`Chat ${payload.chatUuid} assigned to ${data.assignedTo?.name}`);
      break;
    case 'chat.handoff':
      console.log(`Chat ${payload.chatUuid} handed off to live chat: ${data.reason}`);
      break;
    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  return NextResponse.json({ received: true });
}
