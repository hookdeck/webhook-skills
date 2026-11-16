// Generated with: live-tennis-api-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Live Tennis API's receiver check: reject a `t` more than 5 minutes from your clock.
const TOLERANCE_SECONDS = 300;

/**
 * Verify the X-LTAPI-Signature-V1 header.
 * Format: "t=<unix seconds>,v1=<hex>". Each v1 is the hex HMAC-SHA256, keyed with
 * the webhook secret, of "<t>.<raw request body>". Accept if any v1 matches.
 * Never fall back to the deprecated X-LTAPI-Signature: it doesn't cover the timestamp.
 */
function verifyLiveTennisSignature(
  rawBody: string,
  header: string,
  secret: string,
  now = Math.floor(Date.now() / 1000)
): { valid: boolean; timestamp?: number; error?: string } {
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return { valid: false, error: 'Malformed X-LTAPI-Signature-V1 header' };
  }
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) {
    return { valid: false, error: 'Timestamp outside the 5-minute window' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();

  // Check the hex shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  const matched = signatures.some(
    (sig) => /^[0-9a-f]{64}$/i.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected)
  );

  return matched
    ? { valid: true, timestamp: Number(timestamp) }
    : { valid: false, error: 'Invalid signature' };
}

// Seen delivery_ids, kept until t + 5 minutes. With several instances, use a shared
// store with an atomic insert-if-absent (for example Redis SET NX EX) instead.
const seenDeliveries = new Map<string, number>();

function firstDelivery(deliveryId: string, timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (const [id, expiresAt] of seenDeliveries) {
    if (expiresAt < now) seenDeliveries.delete(id);
  }
  if (seenDeliveries.has(deliveryId)) return false;
  seenDeliveries.set(deliveryId, timestamp + TOLERANCE_SECONDS);
  return true;
}

export async function POST(request: NextRequest) {
  const secret = process.env.LIVE_TENNIS_API_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LIVE_TENNIS_API_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const signatureHeader = request.headers.get('x-ltapi-signature-v1');
  if (!signatureHeader) {
    return NextResponse.json({ error: 'Missing X-LTAPI-Signature-V1 header' }, { status: 400 });
  }

  // IMPORTANT: read the raw text body, whatever the Content-Type; don't call request.json() first.
  const rawBody = await request.text();

  const result = verifyLiveTennisSignature(rawBody, signatureHeader, secret);
  if (!result.valid) {
    console.error('Live Tennis API signature verification failed:', result.error);
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  // Parse only after verification
  let frame: any;
  try {
    frame = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // delivery_id is unique per delivery and inside the signed body
  if (frame?.delivery_id && !firstDelivery(frame.delivery_id, result.timestamp!)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // The signed body carries the frame type; X-LTAPI-Event (unsigned) is the fallback.
  const event = frame?.type || request.headers.get('x-ltapi-event');
  console.log(`Received Live Tennis API frame: ${event} (match ${frame?.match_id})`);

  switch (event) {
    case 'score':
      // The complete current score: apply it if its `sequence` is newer than the one you hold
      console.log('Score:', frame.match_id, frame.sequence);
      break;
    case 'score_withdrawn':
      // Discard the state with this sequence and resume from the next score frame
      console.log('Score withdrawn:', frame.match_id, frame.superseded_sequence, frame.kind);
      break;
    case 'point':
      // Store keyed on (match_id, point.seq); fill gaps from GET /matches/{id}/points?after_seq=
      console.log('Point:', frame.match_id, frame.point?.seq);
      break;
    case 'break_point':
      console.log('Break point:', frame.match_id, 'server', frame.server, 'returner', frame.returner);
      break;
    case 'break_point_result':
      // outcome is "held" or "broken"
      console.log('Break point result:', frame.match_id, frame.outcome);
      break;
    case 'status':
      console.log('Status change:', frame.match_id);
      break;
    default:
      console.log('Unhandled Live Tennis API event:', event);
  }

  return NextResponse.json({ received: true, event });
}
