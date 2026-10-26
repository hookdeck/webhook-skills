// Generated with: rebrandly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRebrandlyRequest } from '../../../lib/verify-rebrandly';

interface Click {
  timestamp?: string;
  client?: { language?: string; location?: { country?: string } };
  referral?: Record<string, unknown>;
  route?: { id?: string; destination?: { raw?: string } };
  [key: string]: unknown;
}

function handleClick(click: Click): void {
  const country = click.client?.location?.country;
  console.log(`Click on ${click.route?.id} from ${country ?? 'unknown'} at ${click.timestamp}`);
  // TODO: store the click (click.client, click.referral, click.route)
}

// Clickstream sends POST or PUT, depending on what you gave Rebrandly; every method is accepted.
async function handler(request: NextRequest) {
  // Check the credential first, before reading the body.
  if (!verifyRebrandlyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  // Read as text so any content type is accepted; GET and DELETE have no body.
  const raw = await request.text();
  if (raw.trim() === '') {
    return NextResponse.json({ received: true, clicks: 0 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }
  const { data } = payload as { data?: unknown };
  if (data !== undefined && !Array.isArray(data)) {
    return NextResponse.json({ error: 'Expected data to be an array of clicks' }, { status: 400 });
  }

  // Clickstream body: { data: [ click, ... ], key }. Only click events exist.
  const clicks = (data as Click[] | undefined) ?? [];
  try {
    for (const click of clicks) handleClick(click);
  } catch (err) {
    console.error('Error handling Rebrandly clicks:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true, clicks: clicks.length });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
