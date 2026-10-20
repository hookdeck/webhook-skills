// Generated with: render-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Render signs webhook notifications with Standard Webhooks:
//   webhook-id         the service event ID (evt-...), same on every retry
//   webhook-timestamp  Unix seconds when this delivery attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: the signing secret from the webhook's Settings page in the Render
// Dashboard. The SDK strips an optional `whsec_` prefix and base64-decodes it.
// ---------------------------------------------------------------------------

/**
 * Render's "thin" payload. `status` is only present on build_ended,
 * deploy_ended, cron_job_run_ended and job_run_ended. Fetch full details with
 * GET https://api.render.com/v1/events/{data.id}.
 */
export interface RenderEvent {
  type: string; // e.g. "deploy_ended"
  timestamp: string; // ISO 8601, when the service event occurred
  data: {
    id: string; // evt-..., identical across retries
    serviceId: string;
    serviceName: string;
    status?: 'succeeded' | 'failed' | 'canceled';
  };
}

type RenderHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Render delivery with the Standard Webhooks SDK (Render's docs
 * recommend these libraries). The SDK checks the timestamp (5-minute
 * tolerance), recomputes the HMAC over the raw body, and compares in
 * constant time against every `v1,` entry. Throws on failure.
 */
function verifyRenderWebhook(rawBody: string, headers: RenderHeaders, secret: string): RenderEvent {
  return new Webhook(secret).verify(rawBody, headers) as RenderEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production —
// Render retries failed deliveries (up to 8 attempts) with the same data.id.
const processedEventIds = new Set<string>();

function handleEvent(event: RenderEvent): void {
  const { type, data } = event;
  const service = `${data.serviceName} (${data.serviceId})`;

  switch (type) {
    // --- Deployment lifecycle ----------------------------------------------
    case 'build_started':
      console.log(`Build started for ${service}`);
      break;
    case 'build_ended':
      console.log(`Build ended for ${service}: ${data.status}`);
      break;
    case 'deploy_started':
      console.log(`Deploy started for ${service}`);
      break;
    case 'deploy_ended':
      if (data.status === 'succeeded') {
        // e.g. trigger smoke tests or deploy a dependent service
        console.log(`Deploy succeeded for ${service}`);
      } else {
        console.log(`Deploy ${data.status} for ${service}`);
      }
      break;
    case 'pre_deploy_started':
    case 'pre_deploy_ended':
    case 'commit_ignored':
    case 'branch_deleted':
    case 'image_pull_failed':
    case 'pipeline_minutes_exhausted':
      console.log(`${type} for ${service}`);
      break;

    // --- Jobs and cron jobs -------------------------------------------------
    case 'cron_job_run_started':
      console.log(`Cron job run started for ${service}`);
      break;
    case 'cron_job_run_ended':
    case 'job_run_ended':
      console.log(`${type} for ${service}: ${data.status}`);
      break;

    // --- Service availability ----------------------------------------------
    case 'server_failed':
    case 'server_hardware_failure':
      // Page someone / post to chat — the service is down.
      console.log(`Service unavailable: ${service} (${type})`);
      break;
    case 'server_available':
    case 'server_restarted':
    case 'service_suspended':
    case 'service_resumed':
      console.log(`${type} for ${service}`);
      break;

    // --- Scaling -------------------------------------------------------------
    case 'autoscaling_started':
    case 'autoscaling_ended':
    case 'instance_count_changed':
      // Instance counts are in the Retrieve event API response (details).
      console.log(`${type} for ${service}`);
      break;

    // --- Render Postgres / Key Value ----------------------------------------
    case 'postgres_unavailable':
    case 'key_value_unhealthy':
      console.log(`Datastore problem: ${type} for ${service}`);
      break;
    case 'postgres_available':
    case 'key_value_available':
      console.log(`${type} for ${service}`);
      break;

    default:
      // Render adds event types over time — acknowledge anything unknown.
      console.log(`Unhandled Render event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.RENDER_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RENDER_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body — request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: RenderEvent;
  try {
    event = verifyRenderWebhook(
      rawBody,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      },
      secret
    );
  } catch (err) {
    console.error('Render webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // data.id is identical across retries — acknowledge duplicates with 200.
  const eventId = event.data?.id;
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Render needs a 2xx within 15 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Render event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
