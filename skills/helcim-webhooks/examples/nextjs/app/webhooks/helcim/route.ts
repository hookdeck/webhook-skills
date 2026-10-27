// Generated with: helcim-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Helcim sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  // The verifierToken exactly as Helcim shows it (bare base64). The library also accepts a whsec_ prefix.
  const secret = process.env.HELCIM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HELCIM_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Helcim signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` (key = base64-decoded verifierToken)
    // against every v1, signature and enforces a fixed 5-minute timestamp window
    // (see references/verification.md to change that).
    new Webhook(secret).verify(
      rawBody,
      { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature },
      { jsonParse: false },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Helcim webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; id?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the top-level `type`. cardTransaction is thin: { id, type }.
  // terminalCancel is { data, type }. webhook-id is stable across retries: use it to deduplicate.
  const type = event.type;
  console.log(`Received Helcim webhook ${id}: ${type}`);

  switch (type) {
    case 'cardTransaction':
      // Only the card transaction ID is sent: fetch the rest with Get Card Transaction by ID
      console.log('Card transaction:', event.id);
      break;
    case 'terminalCancel': {
      const data = event.data ?? {};
      console.log('Terminal cancel:', data.deviceCode, data.transactionAmount, data.currency);
      break;
    }
    default:
      // Helcim's documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
