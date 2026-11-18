// Generated with: gusto-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import {
  verifyGustoSignature,
  verificationTokenFrom,
  handleGustoEvent,
  type GustoEvent,
} from '../../../lib/verify-gusto';

export async function POST(request: Request) {
  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const configured = process.env.GUSTO_VERIFICATION_TOKEN;

  // Setup handshake: Gusto POSTs the verification_token after you create the
  // subscription. It can't be verified yet, so acknowledge it and do nothing else.
  const handshakeToken = verificationTokenFrom(rawBody);
  if (handshakeToken !== null) {
    if (!configured?.trim()) {
      console.log(
        `Gusto sent the subscription's verification_token: ${handshakeToken}\n` +
          'Call PUT /v1/webhook_subscriptions/{uuid}/verify with it, then set GUSTO_VERIFICATION_TOKEN.'
      );
    } else {
      console.log('Gusto re-sent the verification_token (not logged: it is your signing key)');
    }
    return NextResponse.json({ received: true, verification_token_received: true });
  }

  if (!configured?.trim()) {
    console.error('GUSTO_VERIFICATION_TOKEN is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  if (!verifyGustoSignature(rawBody, request.headers.get('x-gusto-signature'), configured)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: GustoEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as GustoEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleGustoEvent(event));
}
