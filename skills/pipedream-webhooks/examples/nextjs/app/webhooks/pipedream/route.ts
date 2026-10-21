// Generated with: pipedream-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyPipedreamSignature } from '../../../lib/pipedream-signature';

// Trigger webhooks: events emitted by deployed triggers. Signed with x-pd-signature.
export async function POST(request: NextRequest) {
  const signingKey = process.env.PIPEDREAM_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.error('PIPEDREAM_WEBHOOK_SIGNING_KEY is not set');
    return NextResponse.json({ error: 'Signing key not configured' }, { status: 500 });
  }

  // Read the raw body: the signature covers the exact bytes Pipedream sent.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const verification = verifyPipedreamSignature(rawBody, request.headers.get('x-pd-signature'), signingKey);
  if (!verification.valid) {
    console.error('Pipedream signature verification failed:', verification.error);
    return NextResponse.json({ error: verification.error }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // The body is whatever the deployed trigger emitted, so its shape depends on
  // the trigger (e.g. gitlab-new-issue emits a GitLab issue). There is no
  // Pipedream-level event type field: route on the trigger the URL belongs to.
  // In production: store the event, return 2xx, then process asynchronously.
  console.log('Pipedream trigger event received:', JSON.stringify(event).slice(0, 200));

  return NextResponse.json({ received: true });
}
