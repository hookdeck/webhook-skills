import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Spike API webhook signature: bare hex HMAC-SHA256 of the raw body,
 * keyed with the shared secret from the admin console (UTF-8 bytes, used as-is).
 * No timestamp is signed.
 */
function verifySpikeSignature(rawBody: Buffer, signature: string | null, secret: string): boolean {
  // Validate shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

export async function POST(request: NextRequest) {
  const secret = process.env.SPIKE_API_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SPIKE_API_WEBHOOK_SECRET not configured' }, { status: 500 });
  }

  // Read the RAW bytes; do not parse before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-body-signature');

  if (!verifySpikeSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let events: unknown;
  try {
    events = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body is a JSON ARRAY; one delivery can batch several events
  if (!Array.isArray(events)) {
    return NextResponse.json({ error: 'Expected a JSON array of events' }, { status: 400 });
  }

  for (const event of events as unknown[]) {
    // Everything after verification is still untrusted input: check types
    if (event === null || typeof event !== 'object' || Array.isArray(event)) continue;
    const e = event as Record<string, unknown>;
    const eventType = typeof e.event_type === 'string' ? e.event_type : undefined;
    const user = typeof e.application_user_id === 'string' ? e.application_user_id : 'unknown';
    const provider = typeof e.provider_slug === 'string' ? e.provider_slug : 'unknown';

    switch (eventType) {
      case 'record_change': {
        const metrics = Array.isArray(e.metrics)
          ? e.metrics.filter((m): m is string => typeof m === 'string')
          : [];
        console.log(`New data from ${provider} for ${user}: ${metrics.join(', ') || 'no metrics'}`);
        // Fetch the changed records from the Spike API between
        // earliest_record_start_at and latest_record_end_at
        break;
      }
      case 'provider_integration_created':
        console.log(`${user} connected ${provider}`);
        break;
      case 'provider_integration_deleted':
        console.log(`${user} disconnected ${provider}`);
        break;
      default:
        console.log('Unhandled event type:', eventType);
    }
  }

  // Spike API retries anything other than exactly HTTP 200
  return NextResponse.json({ received: true }, { status: 200 });
}
