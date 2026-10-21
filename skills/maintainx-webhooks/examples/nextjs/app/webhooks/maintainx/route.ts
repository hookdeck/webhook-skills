// Generated with: maintainx-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a MaintainX webhook signature.
 *
 * MaintainX sends `x-maintainx-webhook-body-signature: t=<unix>,v1=<hex>`.
 * v1 is HMAC-SHA256 (hex) over `{t}.{raw body}` keyed with the webhook secret.
 */
function verifyMaintainxSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  toleranceSec: number = timestampToleranceSeconds()
): boolean {
  if (!header || !secret) return false;

  // Parse "t=...,v1=..." into { t, v1 }
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.split('=') as [string, string])
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  if (!/^\d+$/.test(timestamp)) return false;

  // MaintainX recommends a 5-minute window. It's opt-in here (toleranceSec > 0) because
  // retries and replays carry the original timestamp.
  const now = Math.floor(Date.now() / 1000);
  if (toleranceSec > 0 && Math.abs(now - Number(timestamp)) > toleranceSec) return false;

  // Signed content is "{t}.{raw body}" — use the raw body, not parsed JSON
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  // Timing-safe comparison (throws on length mismatch, which means invalid)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification — do not parse JSON first
  const rawBody = await request.text();
  const header = request.headers.get('x-maintainx-webhook-body-signature');

  if (!header) {
    return NextResponse.json(
      { error: 'Missing x-maintainx-webhook-body-signature header' },
      { status: 400 }
    );
  }

  if (!verifyMaintainxSignature(rawBody, header, process.env.MAINTAINX_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Signature is valid — safe to parse the event
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  switch (event.eventType) {
    case 'NEW_WORK_ORDER':
      console.log('New work order:', event.workOrderId);
      // TODO: Sync to ticketing/ERP, notify dispatch, etc.
      break;

    case 'WORK_ORDER_CHANGE':
      console.log('Work order changed:', event.workOrderId);
      // TODO: Update your external record
      break;

    case 'WORK_ORDER_STATUS_CHANGE':
      console.log(`Work order ${event.workOrderId}: ${event.oldStatus} -> ${event.newStatus}`);
      // TODO: Close linked tickets, trigger billing when DONE, etc.
      break;

    case 'NEW_WORK_REQUEST':
      console.log('New work request:', event.workRequestId);
      // TODO: Start triage/approval workflow
      break;

    case 'ASSET_STATUS_CHANGE':
      console.log('Asset status changed:', event.assetId);
      // TODO: Raise downtime alerts, update dashboards
      break;

    default:
      console.log(`Unhandled event type: ${event.eventType}`);
  }

  // Return 2xx quickly (MaintainX times out after 10 seconds)
  return NextResponse.json({ received: true });
}
