// Generated with: ziina-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// X-Hmac-Signature is the bare lowercase hex HMAC-SHA256 of the raw body,
// keyed with the secret's UTF-8 bytes. Nothing else is signed.
function verifyZiinaWebhook(rawBody: Buffer, signatureHeader: string | null, secret: string | undefined): boolean {
  // Validate the format before decoding: exactly 64 hex characters.
  if (!secret || !signatureHeader || !/^[0-9a-fA-F]{64}$/.test(signatureHeader)) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  // Raw bytes, not request.json(): the signature covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyZiinaWebhook(rawBody, request.headers.get('x-hmac-signature'), process.env.ZIINA_WEBHOOK_SECRET)) {
    console.error('Ziina signature verification failed');
    return new Response('Invalid signature', { status: 401 });
  }

  // Parse only after verification.
  let payload: { event?: string; data?: { id?: string; status?: string } };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return new Response('Invalid payload', { status: 400 });
  }

  // The event name does not change with the status; the new state is in data.status.
  const status = payload.data?.status;
  switch (payload.event) {
    case 'payment_intent.status.updated':
      console.log(`Payment intent ${payload.data?.id} is now ${status}`);
      // TODO: if status is 'completed', mark the order paid.
      break;
    case 'refund.status.updated':
      console.log(`Refund ${payload.data?.id} is now ${status}`);
      // TODO: update the refund state in your system.
      break;
    default:
      console.log(`Unhandled Ziina event: ${payload.event}`);
  }

  return new Response('OK', { status: 200 });
}
