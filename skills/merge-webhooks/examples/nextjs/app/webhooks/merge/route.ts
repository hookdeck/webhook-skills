// Generated with: merge-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyMergeSignature, handleMergeEvent, type MergeWebhookPayload } from '../../../lib/verify-merge';

export async function POST(request: Request) {
  const key = process.env.MERGE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !key.trim()) {
    console.error('MERGE_WEBHOOK_SIGNATURE_KEY is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyMergeSignature(rawBody, request.headers.get('x-merge-webhook-signature'), key)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: MergeWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as MergeWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleMergeEvent(payload));
}
