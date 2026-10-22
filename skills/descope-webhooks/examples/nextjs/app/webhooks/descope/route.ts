// Generated with: descope-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Descope signs the exact JSON string it sends: HMAC-SHA256, base64 encoded,
// in the x-descope-webhook-s256 header.
function verifyDescopeSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const received = Buffer.from(signatureHeader);
  if (received.length !== expected.length) return false; // timingSafeEqual needs equal length
  return crypto.timingSafeEqual(received, Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const secret = process.env.DESCOPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('DESCOPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing
  const rawBody = await request.text();
  const signature = request.headers.get('x-descope-webhook-s256');
  if (!signature) {
    return NextResponse.json({ error: 'Missing x-descope-webhook-s256 header' }, { status: 400 });
  }
  if (!verifyDescopeSignature(rawBody, signature, secret)) {
    console.error('Descope signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  // The connector posts a JSON array of up to 100 audit events
  const events: any[] = Array.isArray(parsed) ? parsed : [parsed];

  for (const event of events) {
    switch (event.action) {
      case 'LoginSucceed':
        console.log(`Login succeeded for ${(event.loginIds || []).join(', ')}`);
        break;
      case 'LoginFailed':
        console.log(`Login failed: ${event.data?.error_message}`);
        break;
      case 'UserCreated':
        console.log(`User created: ${event.userId}`);
        break;
      case 'UserModified':
        console.log(`User modified: ${event.userId}`);
        break;
      case 'UserDeleted':
        console.log(`User deleted: ${event.userId}`);
        break;
      case 'Change Password': // some actions contain a literal space
        console.log(`Password changed for user ${event.userId}`);
        break;
      default:
        console.log(`Unhandled Descope audit event: ${event.action}`);
    }
  }

  return NextResponse.json({ received: true, count: events.length });
}
