// Generated with: storylane-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyStorylaneSignature } from '../../../lib/storylane';

export async function POST(request: NextRequest) {
  const secret = process.env.STORYLANE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STORYLANE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing: the signature covers the exact body (any content type)
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-storylane-signature');

  if (!verifyStorylaneSignature(rawBody, signature, secret)) {
    console.error('Storylane webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Dispatch on the top-level `event` field
  switch (payload.event) {
    case 'demo_viewed':
      // `lead` is an object for a known visitor and null for an anonymous one
      console.log(
        `Demo "${payload.name}" viewed (session ${payload.id}) by ${payload.lead?.email ?? 'an unknown visitor'}`
      );
      break;
    default:
      console.log(`Unhandled Storylane event: ${payload.event}`);
  }

  return NextResponse.json({ received: true });
}
