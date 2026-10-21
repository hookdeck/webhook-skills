import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Fivetran webhook signature: HMAC-SHA256 hex of the raw body.
 * Fivetran's own example compares uppercase hex, so compare case-insensitively.
 */
function verifyFivetranWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
    .toUpperCase();
  const actual = signatureHeader.trim().toUpperCase();

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false; // Different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.FIVETRAN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FIVETRAN_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Get the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('x-fivetran-signature-256');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Fivetran-Signature-256 header' }, { status: 400 });
  }

  if (!verifyFivetranWebhook(body, signature, secret)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event type is in the body, not a header
  const { event, connector_id: connectorId, data = {} } = payload;
  console.log(`Received ${event} event (connector: ${connectorId})`);

  switch (event) {
    case 'sync_start':
      console.log(`Sync started for ${connectorId} (sync ${payload.sync_id})`);
      // TODO: Mark pipeline as running
      break;

    case 'sync_end':
      console.log(`Sync ended for ${connectorId}: ${data.status}`);
      // TODO: Trigger dbt/BI refresh when SUCCESSFUL, alert when FAILED
      break;

    case 'status':
      // Deprecated by Fivetran; prefer sync_start / sync_end
      console.log(`Status event for ${connectorId}`);
      break;

    case 'transformation_start':
      console.log('Transformation run started');
      break;

    case 'transformation_succeeded':
      console.log('Transformation run succeeded');
      // TODO: Trigger downstream jobs
      break;

    case 'transformation_failed':
      console.log('Transformation run failed');
      // TODO: Alert on-call
      break;

    case 'connection_successful':
      console.log(`Connection test passed for ${connectorId}`);
      break;

    case 'connection_failure':
      console.log(`Connection test failed for ${connectorId}`);
      // TODO: Notify the connection owner
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 within 10 seconds to acknowledge receipt
  return NextResponse.json({ received: true });
}
