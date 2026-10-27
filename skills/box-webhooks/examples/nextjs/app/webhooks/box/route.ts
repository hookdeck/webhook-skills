// Generated with: box-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Box V2 webhooks send BOX-SIGNATURE-PRIMARY (and BOX-SIGNATURE-SECONDARY): standard padded base64
// HMAC-SHA256 of the raw request body followed by the BOX-DELIVERY-TIMESTAMP header value, with
// no separator, keyed with the signature key. Only the primary signature is verified here.
// https://developer.box.com/guides/webhooks/v2/signatures-v2/

// 44 characters: 43 base64 characters plus one "=" pad (a 32-byte digest)
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

// Optional replay window in seconds. Off by default (0 or unset): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set BOX_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in (Box suggests 600);
// any other value is treated as 0, with a warning.
let warnedInvalidTolerance = false;
function toleranceSeconds(): number {
  const raw = (process.env.BOX_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BOX_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
toleranceSeconds(); // surface an invalid value at startup

function verifyBox(rawBody: Buffer, signature: string | null, timestamp: string | null, secret: string): boolean {
  if (!secret || !signature || !timestamp) return false;
  if (!BASE64_SHA256.test(signature)) return false;

  // BOX-DELIVERY-TIMESTAMP is an RFC 3339 date. Opt-in only.
  const tolerance = toleranceSeconds();
  if (tolerance > 0) {
    const sent = Date.parse(timestamp);
    if (Number.isNaN(sent) || Math.abs(Date.now() - sent) > tolerance * 1000) return false;
  }

  // Signed message as bytes: raw body, then the timestamp header exactly as received (latin1)
  const signed = Buffer.concat([rawBody, Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('base64');

  const a = Buffer.from(signature, 'latin1');
  const b = Buffer.from(expected, 'latin1');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Box's docs don't name the HTTP method (Hookdeck pre-selects POST, unmanaged), so every method is
// verified the same way.
async function handle(request: NextRequest) {
  const secret = process.env.BOX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BOX_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: read before any JSON parsing. A request without a body gives empty bytes.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (
    !verifyBox(
      rawBody,
      request.headers.get('box-signature-primary'),
      request.headers.get('box-delivery-timestamp'),
      secret
    )
  ) {
    console.error('Box webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Hookdeck leaves the method unmanaged, so a verified request may arrive without a body
  if (rawBody.length === 0) return NextResponse.json({ received: true });

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // event.id is stable across Box retries (BOX-DELIVERY-ID changes per retry): use it to dedupe
  const { trigger, id } = event;
  const source = event.source ?? {};

  switch (trigger) {
    case 'FILE.UPLOADED':
    case 'FILE.DOWNLOADED':
    case 'FILE.TRASHED':
      console.log(`${trigger}: file ${source.id} "${source.name}" (event ${id})`);
      break;
    case 'FOLDER.CREATED':
      console.log(`${trigger}: folder ${source.id} "${source.name}" (event ${id})`);
      break;
    case 'COMMENT.CREATED':
      console.log(`${trigger}: comment ${source.id} (event ${id})`);
      break;
    case 'COLLABORATION.CREATED':
      console.log(`${trigger}: collaboration ${source.id} (event ${id})`);
      break;
    case 'SIGN_REQUEST.COMPLETED':
      console.log(`${trigger}: sign request ${source.id} completed (event ${id})`);
      break;
    default:
      console.log(`Unhandled trigger: ${trigger}`);
  }

  return NextResponse.json({ received: true });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
