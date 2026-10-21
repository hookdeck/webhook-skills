import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set WHOP_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.WHOP_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`WHOP_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Whop delivery (Standard Webhooks) and return the parsed body. Throws if it's invalid.
 *
 * Written out rather than calling the SDK's unwrapWebhook(), because that always enforces a
 * 5-minute timestamp window. Hookdeck retries and replays carry the original
 * webhook-timestamp, so that window would reject them. Here the window is opt-in via
 * WHOP_TIMESTAMP_TOLERANCE_SECONDS.
 */
function verifyWhopWebhook(
  rawBody: string,
  headers: Record<string, string | null | undefined>,
  secret: string,
  toleranceSeconds: number = timestampToleranceSeconds()
): any {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing webhook-* signature headers');
  if (!/^\d+$/.test(timestamp)) throw new Error('Invalid webhook-timestamp');
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  // The key is the literal UTF-8 bytes of the ws_ secret: don't strip ws_ or base64-decode it
  const expected = crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // webhook-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
  const match = signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw new Error('No matching signature');
  return JSON.parse(rawBody);
}

export async function POST(request: NextRequest) {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('WHOP_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: Whop signs "{webhook-id}.{webhook-timestamp}.{raw body}".
  // Never call request.json() before verifying.
  const payload = await request.text();

  let event: { type: string; data: { id?: string } & Record<string, unknown> };
  try {
    // Verifies the Standard Webhooks signature (HMAC-SHA256, v1,<base64>). The secret is used
    // exactly as Whop issued it (ws_...). The timestamp window is opt-in
    // (WHOP_TIMESTAMP_TOLERANCE_SECONDS).
    event = verifyWhopWebhook(payload, Object.fromEntries(request.headers), secret);
  } catch (err) {
    console.error('Whop signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same webhook-id: store it and skip duplicates in production.
  switch (event.type) {
    case 'payment.succeeded':
      console.log('Payment succeeded:', event.data.id);
      break;
    case 'payment.failed':
      console.log('Payment failed:', event.data.id);
      break;
    case 'membership.activated':
      console.log('Membership activated:', event.data.id);
      break;
    case 'membership.deactivated':
      console.log('Membership deactivated:', event.data.id);
      break;
    case 'refund.created':
      console.log('Refund created:', event.data.id);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  // Respond 2xx within 5 seconds or Whop retries.
  return NextResponse.json({ received: true });
}
