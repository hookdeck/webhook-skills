// Generated with: violet-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyVioletSignature, handleEvent, isObject } from '../../../lib/violet';

export async function POST(request: NextRequest) {
  const secret = process.env.VIOLET_WEBHOOK_SECRET;
  if (!secret) {
    console.error('VIOLET_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the exact bytes BEFORE parsing: the signature covers the raw body only
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyVioletSignature(rawBody, request.headers.get('x-violet-hmac'), secret)) {
    console.error('Violet webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only the header names the event: without it the body cannot be classified
  const topic = request.headers.get('x-violet-topic');
  if (!topic) {
    return NextResponse.json({ error: 'Missing X-Violet-Topic header' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  // Dedupe key: recovery case events carry a stable X-Violet-Recovery-Event-Key (their
  // X-Violet-Event-Id can change), and a resend carries the original ID in X-Violet-Event-Id-Source
  const dedupeKey =
    request.headers.get('x-violet-recovery-event-key') ||
    request.headers.get('x-violet-event-id-source') ||
    request.headers.get('x-violet-event-id');
  console.log(`Violet event ${dedupeKey || '(no id)'}`);
  handleEvent(topic, body);

  // Respond 2XX within 10 seconds; do slow work asynchronously
  return NextResponse.json({ received: true });
}
