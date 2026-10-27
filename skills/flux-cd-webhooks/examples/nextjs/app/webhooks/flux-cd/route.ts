import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Flux CD generic-hmac webhook.
 * X-Signature is `sha256=<hex>` (bare hex is also accepted): HMAC-SHA256 of the raw body only.
 */
function verifyFluxWebhook(rawBody: Buffer, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) {
    return false;
  }

  const digest = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;

  // Validate the format before decoding: exactly 64 hex characters (case-insensitive)
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(digest, 'hex');

  return crypto.timingSafeEqual(received, expected);
}

export async function POST(request: NextRequest) {
  // Raw bytes for any content type; never decode and re-encode before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-signature');

  if (!verifyFluxWebhook(rawBody, signature, process.env.FLUX_CD_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Flux has no event-name field: branch on severity and reason
  const { severity, reason, message, involvedObject } = event;
  const target = `${involvedObject?.kind}/${involvedObject?.namespace}/${involvedObject?.name}`;

  switch (severity) {
    case 'error':
      console.log(`Flux error on ${target}: ${reason} - ${message}`);
      // TODO: Page on-call, open an incident, etc. (e.g. reason ValidationFailed, ReconciliationFailed)
      break;

    case 'info':
      console.log(`Flux info on ${target}: ${reason} - ${message}`);
      // TODO: Record deploys, notify a channel, etc. (e.g. reason ReconciliationSucceeded)
      break;

    default:
      console.log(`Unhandled severity: ${severity}`);
  }

  return NextResponse.json({ received: true });
}
