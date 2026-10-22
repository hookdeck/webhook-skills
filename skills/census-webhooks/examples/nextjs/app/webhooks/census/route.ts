import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Census (Fivetran Activations) webhook signature:
 * standard base64 HMAC-SHA256 of the raw body, keyed with the secret's raw bytes.
 */
function verifyCensusWebhook(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader.trim()), Buffer.from(expected));
  } catch {
    return false; // Different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.CENSUS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CENSUS_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes (whatever the Content-Type) for signature verification
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Signature header' }, { status: 400 });
  }

  if (!verifyCensusWebhook(rawBody, signature, secret)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event type is in the body (`event`), not a header
  const { event, sync_id: syncId, sync_run_id: syncRunId } = payload;
  console.log(`Received ${event} event (sync ${syncId}, run ${syncRunId})`);

  switch (event) {
    case 'sync.triggered':
      console.log(`Sync run ${syncRunId} queued`);
      break;

    case 'sync.started':
      console.log(`Sync run ${syncRunId} started`);
      // TODO: Mark the run as in progress
      break;

    case 'sync.completed':
      // Fires for successful and failed runs: status is "ok" or "emergency"
      console.log(`Sync run ${syncRunId} completed with status ${payload.status}`);
      break;

    case 'sync.success':
      console.log(`Sync run ${syncRunId} succeeded`);
      // TODO: Kick off downstream jobs that depend on the synced data
      break;

    case 'sync.failed':
      console.log(`Sync run ${syncRunId} failed`);
      // TODO: Page on-call or open a ticket
      break;

    case 'sync.alert.raised':
      console.log(`Alert raised (${payload.alert_type}): ${payload.message} - ${payload.details}`);
      // TODO: Route to your alerting tool; payload.followup_url links to the sync history
      break;

    case 'sync.alert.resolved':
      console.log(`Alert resolved (${payload.alert_type}): ${payload.message}`);
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
