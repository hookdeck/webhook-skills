// Generated with: typefully-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Typefully signs every delivery:
//   X-Typefully-Timestamp: <unix seconds>
//   X-Typefully-Signature: sha256=<hex>
// The signature is HMAC-SHA256 (hex) of "<X-Typefully-Timestamp>.<raw body>" keyed with the webhook secret.
// https://typefully.com/docs/api (Webhooks)

// Optional replay window in seconds. Off by default (0): Hookdeck's retries and replays carry the
// original timestamp (Typefully doesn't document whether its own retries do), so a window could
// reject late redeliveries.
// Set TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function toleranceSeconds(): number {
  const raw = (process.env.TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}

function verifyTypefully(
  rawBody: Buffer,
  timestamp: string | null,
  signature: string | null,
  secret: string
): boolean {
  if (!secret || !timestamp || !signature) return false;

  // The header carries "sha256=<hex>"; the bare digest is accepted too.
  const digest = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) return false;

  const tolerance = toleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) return false;
  }

  // Signed message as bytes: timestamp header (latin1) + "." + raw body. Never re-encode the body.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]))
    .digest();
  const received = Buffer.from(digest.toLowerCase(), 'hex'); // validated above, so nothing is dropped
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  const secret = process.env.TYPEFULLY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('TYPEFULLY_WEBHOOK_SECRET is not set');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Raw bytes, exactly as sent. Do not call request.json() before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const valid = verifyTypefully(
    rawBody,
    request.headers.get('x-typefully-timestamp'),
    request.headers.get('x-typefully-signature'),
    secret
  );
  if (!valid) {
    console.error('Typefully webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let payload: { event?: string; data?: Record<string, any> };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return new NextResponse('Invalid payload', { status: 400 });
  }

  // Envelope: { event: "draft.created", data: <draft> }
  const draft = payload.data ?? {};
  switch (payload.event) {
    case 'draft.created':
      console.log(`Draft ${draft.id} created: ${draft.draft_title ?? draft.preview ?? ''}`);
      break;
    case 'draft.scheduled':
      console.log(`Draft ${draft.id} scheduled for ${draft.scheduled_date}`);
      break;
    case 'draft.published':
      console.log(`Draft ${draft.id} published (${draft.x_published_url ?? 'no X url'})`);
      break;
    case 'draft.status_changed':
      console.log(`Draft ${draft.id} status is now ${draft.status}`);
      break;
    case 'draft.deleted':
      console.log(`Draft ${draft.id} deleted`);
      break;
    default:
      // draft.planned, draft.tags_changed, and anything added later
      console.log(`Unhandled event: ${payload.event}`);
  }

  return NextResponse.json({ received: true });
}
