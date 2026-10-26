// Generated with: qlik-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { ALLOWED_METHODS, handleEvent, isObject, verifyQlikSignature } from '../../../lib/verify-qlik-cloud';

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!process.env.QLIK_CLOUD_WEBHOOK_SECRET) {
    console.error('Set QLIK_CLOUD_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, exactly as received. GET and DELETE (and some PUT/PATCH) have no body,
  // which is verified as zero bytes.
  const rawBody = new Uint8Array(await request.arrayBuffer());

  // Signature first, for every method.
  if (!verifyQlikSignature(rawBody, request.headers.get('qlik-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing qlik-signature' }, { status: 401 });
  }

  if (!ALLOWED_METHODS.includes(request.method)) {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { Allow: ALLOWED_METHODS.join(', ') } }
    );
  }

  if (rawBody.length === 0) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Qlik Cloud event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
