// Generated with: formspree-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import {
  deliveryKey,
  handleSubmission,
  isPlainObject,
  seenDeliveries,
  verifyFormspreeSignature,
} from '../../../lib/formspree-signature';

export async function POST(request: NextRequest) {
  const secret = process.env.FORMSPREE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FORMSPREE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes exactly as received, whatever the content type. Build Hooks send
  // an empty body.
  const rawBody = Buffer.from(await request.arrayBuffer());

  // 1. Verify first, on the raw bytes.
  const verification = verifyFormspreeSignature(
    rawBody,
    request.headers.get('formspree-signature'),
    secret
  );
  if (!verification.valid) {
    console.error('Formspree webhook verification failed:', verification.error);
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  // 2. Build Hook: valid delivery, nothing to read.
  if (rawBody.length === 0) {
    return NextResponse.json({ received: true });
  }

  // 3. Parse only now.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  if (!isPlainObject(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  // 4. Retries can duplicate a submission: skip ones already handled.
  const key = deliveryKey(rawBody);
  if (seenDeliveries.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  seenDeliveries.add(key);

  // Answer within 3 seconds: in production, persist or queue here, then process async.
  handleSubmission(payload);

  return NextResponse.json({ received: true });
}
