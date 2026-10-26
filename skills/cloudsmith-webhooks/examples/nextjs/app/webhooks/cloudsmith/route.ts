// Generated with: cloudsmith-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const HEX_SHA1 = /^[0-9a-fA-F]{40}$/;

/**
 * Verify a Cloudsmith webhook signature.
 * Cloudsmith sends the bare hex HMAC-SHA1 of the raw body (key = the webhook's
 * HMAC Signature Key, UTF-8) in the X-Cloudsmith-Signature header.
 */
function verifyCloudsmithWebhook(
  rawBody: Buffer,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret || !HEX_SHA1.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  // The format was checked above, so decoding cannot silently drop characters
  const received = Buffer.from(signature, 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function handleEvent(item: JsonObject): void {
  // Every field of the body is untrusted: check types before reading into it
  const meta = isObject(item.meta) ? item.meta : {};
  const data = isObject(item.data) ? item.data : {};
  const eventId = typeof meta.event_id === 'string' ? meta.event_id : undefined;
  const pkg = [data.namespace, data.repository, data.name]
    .filter((part) => typeof part === 'string')
    .join('/');
  console.log(`Received ${eventId ?? 'unknown event'} (trigger ${meta.trigger_id ?? 'n/a'})`);

  switch (eventId) {
    case 'ping':
      console.log('Cloudsmith ping received');
      break;

    case 'package.created':
      console.log(`Package created: ${pkg}`);
      // TODO: Record the new upload
      break;

    case 'package.syncing':
    case 'package.synced':
      console.log(`${eventId}: ${pkg} (${data.stage_str ?? 'unknown stage'})`);
      // TODO: package.synced means the package is ready to download
      break;

    case 'package.security_scanned':
      console.log(`Security scan finished: ${pkg}`);
      // TODO: Fetch the scan results from the Cloudsmith API
      break;

    case 'package.quarantined':
      console.log(`Package quarantined: ${pkg}`);
      // TODO: Alert the owning team
      break;

    case 'package.failed':
      console.log(`Package failed: ${pkg}`);
      break;

    case 'package.released':
    case 'package.restored':
    case 'package.tags_updated':
    case 'package.deleted':
      console.log(`${eventId}: ${pkg}`);
      break;

    default:
      console.log(`Unhandled event: ${eventId}`);
  }
}

export async function POST(request: Request) {
  // Read the raw bytes before parsing - the signature covers exactly these bytes
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyCloudsmithWebhook(
    rawBody,
    request.headers.get('x-cloudsmith-signature'),
    process.env.CLOUDSMITH_WEBHOOK_SECRET
  )) {
    console.error('Cloudsmith webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Default "JSON Object" format is one event; "JSON Array" wraps it in [...]
  const items: unknown[] = Array.isArray(payload) ? payload : [payload];
  const events = items.filter(isObject);
  if (events.length !== items.length) {
    return NextResponse.json({ error: 'Unexpected payload shape' }, { status: 400 });
  }
  events.forEach(handleEvent);

  return NextResponse.json({ received: true });
}
