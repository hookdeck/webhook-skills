// Generated with: treet-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { ALLOWED_METHODS, handleEvent, verifyTreetSignature } from '../../../lib/verify-treet';

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!process.env.TREET_WEBHOOK_SECRET) {
    console.error('Set TREET_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, exactly as received. A request with no body gives zero bytes.
  const rawBody = Buffer.from(await request.arrayBuffer());

  // Signature first, for every method.
  if (!verifyTreetSignature(rawBody, request.headers.get('x-treet-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  if (!ALLOWED_METHODS.includes(request.method)) {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { Allow: ALLOWED_METHODS.join(', ') } }
    );
  }

  // GET and DELETE (and some PUT/PATCH) carry no body: acknowledge them.
  const text = rawBody.toString('utf8');
  if (text.trim() === '') {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling Treet event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
