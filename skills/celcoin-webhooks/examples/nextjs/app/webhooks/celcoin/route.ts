// Generated with: celcoin-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { ALLOWED_METHODS, handleEvent, verifyCelcoinAuth } from '../../../lib/verify-celcoin';

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CELCOIN_WEBHOOK_USERNAME || !process.env.CELCOIN_WEBHOOK_PASSWORD) {
    console.error('Set CELCOIN_WEBHOOK_USERNAME and CELCOIN_WEBHOOK_PASSWORD');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  // Credential first, for every method. Hookdeck never sends a 401 challenge, so the
  // Authorization header must be present on each request.
  if (!verifyCelcoinAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
  }

  if (!ALLOWED_METHODS.includes(request.method)) {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { Allow: ALLOWED_METHODS.join(', ') } }
    );
  }

  // GET and DELETE (and some PUT/PATCH) carry no body: acknowledge them.
  const rawBody = await request.text();
  if (rawBody.trim() === '') {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Parameters<typeof handleEvent>[0]);
  } catch (err) {
    console.error('Error handling Celcoin event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
