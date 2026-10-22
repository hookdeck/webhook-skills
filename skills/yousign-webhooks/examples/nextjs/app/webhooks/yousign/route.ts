// Generated with: yousign-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body is required for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get('x-yousign-signature-256');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Yousign-Signature-256 header' }, { status: 400 });
  }
  if (!verifySignature(rawBody, signature, process.env.YOUSIGN_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event_id?: string; event_name?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // event_id is globally unique: use it to deduplicate retries (x-yousign-retry > 0)
  switch (event.event_name) {
    case 'signature_request.activated':
      console.log('Signature request activated:', event.data?.signature_request?.id);
      break;
    case 'signature_request.done':
      console.log('Signature request done:', event.data?.signature_request?.id);
      break;
    case 'signature_request.declined':
      console.log('Signature request declined:', event.data?.signature_request?.id);
      break;
    case 'signer.done':
      console.log('Signer done:', event.data?.signer?.id);
      break;
    case 'signer.declined':
      console.log('Signer declined:', event.data?.signer?.id);
      break;
    default:
      console.log('Unhandled event:', event.event_name);
  }

  // Respond 2xx within 1 second
  return NextResponse.json({ received: true });
}
