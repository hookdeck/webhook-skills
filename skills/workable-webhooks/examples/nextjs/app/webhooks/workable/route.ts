// Generated with: workable-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Workable signs the raw body with HMAC-SHA256 (hex) in X-Workable-Signature.
// The key is the API token that created the subscription (or the OAuth app secret).
function verifySignature(rawBody: string, signatureHeader: string | null, key: string | undefined): boolean {
  if (!signatureHeader || !key) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader.toLowerCase()), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

export async function POST(request: NextRequest) {
  // text() returns the raw body regardless of Content-Type
  const rawBody = await request.text();

  const signature = request.headers.get('x-workable-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Workable-Signature header' }, { status: 400 });
  }
  if (!verifySignature(rawBody, signature, process.env.WORKABLE_SIGNING_KEY)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: { id?: string; event_type?: string; event?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = payload.event_type ?? payload.event;
  switch (eventType) {
    case 'candidate_created':
      console.log('Candidate created:', payload.id);
      break;
    case 'candidate_moved':
      console.log('Candidate moved:', payload.id);
      break;
    case 'employee_created':
      console.log('Employee created:', payload.id);
      break;
    case 'employee_updated':
      console.log('Employee updated:', payload.id);
      break;
    case 'employee_published':
      console.log('Employee published:', payload.id);
      break;
    default:
      console.log('Unhandled event:', eventType);
  }

  // Workable replays the request unless the response is 200.
  return NextResponse.json({ received: true });
}
