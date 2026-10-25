// Generated with: live-tennis-api-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Verify the X-LTAPI-Signature header.
 * Format: "sha256=<64 hex chars>", the HMAC-SHA256 of the raw body keyed with
 * the webhook secret. X-LTAPI-Timestamp is NOT signed, so it plays no part here.
 */
function verifyLiveTennisSignature(
  rawBody: string,
  header: string,
  secret: string
): { valid: boolean; error?: string } {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header);
  if (!match) {
    return { valid: false, error: 'Malformed X-LTAPI-Signature header' };
  }

  // The header is exactly 64 hex chars, so Buffer.from(..., 'hex') can't truncate
  const received = Buffer.from(match[1], 'hex');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();

  return crypto.timingSafeEqual(received, expected)
    ? { valid: true }
    : { valid: false, error: 'Invalid signature' };
}

export async function POST(request: NextRequest) {
  const secret = process.env.LIVE_TENNIS_API_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LIVE_TENNIS_API_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const signatureHeader = request.headers.get('x-ltapi-signature');
  if (!signatureHeader) {
    return NextResponse.json({ error: 'Missing X-LTAPI-Signature header' }, { status: 400 });
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

  // The signed body carries the frame type; X-LTAPI-Event (unsigned) is the fallback.
  // Delivery is at-most-once: dedupe score frames on `sequence` and point frames on `point.seq`.
  const event = frame?.type || request.headers.get('x-ltapi-event');
  console.log(`Received Live Tennis API frame: ${event} (match ${frame?.match_id})`);

  switch (event) {
    case 'score':
      console.log('Score:', frame.match_id, frame.sets, frame.games, frame.points);
      // TODO: update your scoreboard (each score frame is the complete current score)
      break;
    case 'point':
      console.log('Point:', frame.match_id, frame.point?.seq, 'won by', frame.point?.winner);
      // TODO: store the point keyed on (match_id, point.seq); recover gaps via GET /matches/{id}/points?after_seq=
      break;
    case 'break_point':
      console.log('Break point:', frame.match_id, 'server', frame.server, 'returner', frame.returner);
      // TODO: raise an alert
      break;
    case 'break_point_result':
      console.log('Break point result:', frame.match_id, frame.outcome);
      // TODO: settle the break point (outcome is "held" or "broken")
      break;
    default:
      console.log('Unhandled Live Tennis API event:', event);
  }

  return NextResponse.json({ received: true, event });
}
