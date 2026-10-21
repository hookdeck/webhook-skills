// Generated with: dbt-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a dbt Cloud webhook.
 *
 * dbt Cloud puts the bare lowercase hex HMAC-SHA256 of the raw request body in
 * the `Authorization` header (no scheme, no "Bearer"), keyed with the webhook's
 * secret (`hmac_secret`) used as a raw UTF-8 string.
 */
function verifyDbtCloudSignature(
  rawBody: string,
  authHeader: string | null,
  secret: string | undefined
): boolean {
  if (!authHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Timing-safe comparison; guard the length first because timingSafeEqual throws on mismatch
  const received = Buffer.from(authHeader.trim());
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}

export async function POST(request: NextRequest) {
  // Read the raw body as text - never request.json() before verifying
  const rawBody = await request.text();
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return new NextResponse('Missing Authorization header', { status: 400 });
  }

  if (!verifyDbtCloudSignature(rawBody, authHeader, process.env.DBT_CLOUD_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 400 });
  }

  // Signature is valid - safe to parse the event
  let event: { eventType?: string; eventId?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // eventId is unique per event: use it to dedupe retries
  // (job.run.errored is a subset of job.run.completed, so one failed run can notify twice)
  switch (event.eventType) {
    case 'job.run.started':
      console.log('Run started:', event.data?.runId, event.data?.jobName);
      // TODO: Post to chat, mark the pipeline as in progress, etc.
      break;

    case 'job.run.completed':
      console.log('Run completed:', event.data?.runId, event.data?.runStatus);
      // TODO: Fetch artifacts, trigger downstream jobs, refresh dashboards, etc.
      break;

    case 'job.run.errored':
      console.log('Run errored:', event.data?.runId, event.data?.runStatusMessage);
      // TODO: Page on-call, open a ticket, etc. (artifacts may not be ingested yet)
      break;

    default:
      console.log(`Unhandled event type: ${event.eventType}`);
  }

  // Return 2xx quickly: dbt times out after 10 seconds
  return NextResponse.json({ received: true });
}
