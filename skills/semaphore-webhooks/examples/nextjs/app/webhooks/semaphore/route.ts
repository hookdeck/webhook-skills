// Generated with: semaphore-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { ALLOWED_METHODS, handleEvent, verifySemaphoreSignature } from '../../../lib/verify-semaphore';

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!process.env.SEMAPHORE_WEBHOOK_SECRET) {
    console.error('Set SEMAPHORE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // The exact bytes Semaphore signed. A missing body is zero bytes.
  const rawBody = Buffer.from(await request.arrayBuffer());

  // Signature first, for every method.
  if (!verifySemaphoreSignature(rawBody, request.headers.get('x-semaphore-signature-256'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  if (!ALLOWED_METHODS.includes(request.method)) {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { Allow: ALLOWED_METHODS.join(', ') } }
    );
  }

  // GET and DELETE carry no body: once verified, acknowledge them.
  if (rawBody.length === 0) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    // X-Semaphore-Webhook-Id is the dedupe key (a timeout retry re-sends the same delivery).
    handleEvent(payload as Parameters<typeof handleEvent>[0], request.headers.get('x-semaphore-webhook-id'));
  } catch (err) {
    console.error('Error handling Semaphore event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
