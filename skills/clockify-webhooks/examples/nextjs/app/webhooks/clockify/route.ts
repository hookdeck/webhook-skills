// Generated with: clockify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import {
  verifyClockifySignature,
  parseTokens,
  handleClockifyEvent,
  type ClockifyEntity,
} from '../../../lib/verify-clockify';

export async function POST(request: Request) {
  const tokens = parseTokens(process.env.CLOCKIFY_WEBHOOK_SIGNING_SECRET);
  if (tokens.length === 0) {
    console.error('CLOCKIFY_WEBHOOK_SIGNING_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  if (!verifyClockifySignature(request.headers.get('clockify-signature'), tokens)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  let entity: ClockifyEntity;
  try {
    entity = (JSON.parse(rawBody.toString('utf8')) ?? {}) as ClockifyEntity;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = request.headers.get('clockify-webhook-event-type');
  return NextResponse.json(handleClockifyEvent(eventType, entity));
}
