// Generated with: nmi-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an NMI (Network Merchants) webhook.
 *
 * NMI does NOT use Standard Webhooks. Each delivery carries a single header:
 *
 *   Webhook-Signature: t=<nonce>,s=<lowercase-hex-hmac>
 *
 * IMPORTANT: NMI calls `t` a nonce and documents no replay/age window, so
 * don't parse it as a Unix time. The signature `s` is HMAC-SHA256 over "<nonce>.<raw_body>",
 * keyed with the webhooks signing key, hex-encoded (lowercase). We must hash the
 * raw, unparsed body — re-serializing the JSON would break the HMAC.
 */
export function verifyNmiWebhook(
  rawBody: string,
  signatureHeader: string | null,
  signingKey: string
): boolean {
  // Parse "t=<nonce>,s=<hex>" into { t, s }. Split each segment at the FIRST
  // '=' so a value containing '=' is preserved, and don't rely on ordering.
  const parts: Record<string, string> = {};
  for (const seg of String(signatureHeader || '').split(',')) {
    const i = seg.indexOf('=');
    if (i !== -1) {
      parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
    }
  }
  const nonce = parts.t;
  const signature = parts.s;

  if (!nonce || !signature) {
    return false;
  }
  // Fail closed if the signing key is unset rather than throwing from createHmac.
  if (!signingKey) {
    console.error('NMI_SIGNING_KEY is not set — rejecting delivery');
    return false;
  }

  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${nonce}.${rawBody}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false; // length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body — required for signature verification.
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('Webhook-Signature');

  if (!signatureHeader) {
    return NextResponse.json({ error: 'Missing Webhook-Signature header' }, { status: 400 });
  }

  // Verify before parsing.
  if (!verifyNmiWebhook(rawBody, signatureHeader, process.env.NMI_SIGNING_KEY!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Safe to parse now that the signature checks out.
  let event: { event_id?: string; event_type?: string; event_body?: unknown };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event_id: eventId, event_type: eventType } = event;
  console.log(`Received ${eventType} (event_id ${eventId})`);

  // Event names are dotted: transaction.<action>.<result>. Dispatch on the
  // action segment; return 200 quickly and do slow work asynchronously.
  const action = String(eventType || '').split('.')[1];
  switch (action) {
    case 'sale':
      // Your code: fulfil order / send receipt on success, dunning on failure
      break;

    case 'auth':
      // Your code: hold order while funds are authorized
      break;

    case 'capture':
      // Your code: mark order paid, fulfil
      break;

    case 'void':
      // Your code: release hold, cancel order
      break;

    case 'refund':
      // Your code: reverse fulfilment, notify customer
      break;

    case 'credit':
      // Your code: payout/adjustment bookkeeping
      break;

    case 'validate':
      // Your code: save card on file
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Acknowledge quickly so NMI does not retry.
  return NextResponse.json({ received: true });
}
