// Generated with: coassemble-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Coassemble sends X-Coassemble-Signature: "sha256=<hex>" and X-Coassemble-Timestamp (Unix seconds).
// The signature is HMAC-SHA256 (hex) of "<X-Coassemble-Timestamp>.<raw body>" keyed with the webhook secret.
// https://developers.coassemble.com/webhooks

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function verifyCoassemble(
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

  // Opt-in replay window; X-Coassemble-Timestamp is Unix seconds
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
  const secret = process.env.COASSEMBLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('COASSEMBLE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read the bytes before any JSON parsing
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (
    !verifyCoassemble(
      rawBody,
      request.headers.get('x-coassemble-signature'),
      request.headers.get('x-coassemble-timestamp'),
      secret
    )
  ) {
    // Missing, malformed or wrong signature
    console.error('Coassemble webhook signature verification failed');
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

    // Dedupe on the X-Coassemble-Delivery header: retries and replays keep the same delivery ID
  const data = payload.data || {};
  const tracking = data.tracking || {};
  const course = data.course || {};

  // Test deliveries (testMode: true, including the dashboard's test button) are signed and delivered
  // like real ones, so acknowledge them without taking production actions
  if (payload.testMode) {
    console.log(`Test event ${payload.type} acknowledged (no action taken)`);
    return NextResponse.json({ received: true, test: true });
  }

  switch (payload.type) {
    case 'course.created':
      console.log(`Course created in workspace ${payload.workspaceId}`);
      break;
    case 'course.commenced':
      console.log(`${tracking.identifier} commenced "${course.title}"${data.collection ? ` in collection ${data.collection.key}` : ''}`);
      break;
    case 'course.completed':
      console.log(`${tracking.identifier} completed "${course.title}" in ${tracking.totalTime}s`);
      break;
    case 'quiz.completed':
      console.log(`Quiz passed (delivery ${payload.id})`);
      break;
    case 'quiz.failed':
      console.log(`Quiz failed (delivery ${payload.id})`);
      break;
    case 'migration.progress':
      console.log(`Migration batch ${data.id}: "${data.item?.title}" ${data.item?.status}`);
      break;
    case 'migration.completed':
      console.log(`Migration batch ${data.id} ${data.status}: ${data.counts?.succeeded}/${data.counts?.total} succeeded`);
      break;
    default:
      console.log(`Unhandled event: ${payload.type}`);
  }

  return NextResponse.json({ received: true });
}
