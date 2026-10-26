// Generated with: morta-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { handleMortaEvent, isObject, verifyMortaWebhook } from '../../../lib/morta';

export async function POST(request: NextRequest) {
  // Read the raw bytes BEFORE parsing - the signature is over the exact body
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const header = request.headers.get('morta-signature');
  const secret = process.env.MORTA_WEBHOOK_SECRET;

  if (!secret) {
    console.error('MORTA_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!header || !verifyMortaWebhook(rawBody, header, secret)) {
    console.error('Morta webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification, and treat the result as untrusted
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  handleMortaEvent(body);

  // Any 2xx acknowledges, and Morta expects it within 10 seconds
  return NextResponse.json({ received: true });
}
