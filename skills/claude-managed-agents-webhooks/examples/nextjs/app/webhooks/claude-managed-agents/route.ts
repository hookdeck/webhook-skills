// Generated with: claude-managed-agents-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify Claude Managed Agents webhook signature (Standard Webhooks).
 *
 * Signed content: "{webhook-id}.{webhook-timestamp}.{rawBody}"
 * Algorithm: HMAC-SHA256, base64-encoded, with the whsec_-prefixed secret
 * base64-decoded as the HMAC key.
 */
function verifyClaudeSignature(
  payload: string,
  webhookId: string | null,
  webhookTimestamp: string | null,
  webhookSignature: string | null,
  secret: string
): boolean {
  if (!webhookId || !webhookTimestamp || !webhookSignature || !webhookSignature.includes(',')) {
    return false;
  }

  // Reject payloads older than 5 minutes to prevent replay attacks
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampDiff = currentTime - parseInt(webhookTimestamp);
  if (Number.isNaN(timestampDiff) || timestampDiff > 300 || timestampDiff < -300) {
    return false;
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

  // whsec_ prefix wraps a base64-encoded 32-byte key
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secretKey, 'base64');
  } catch {
    return false;
  }

  const expectedSignature = createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  // The header may carry multiple space-separated "v1,<sig>" pairs (rotation)
  return webhookSignature.split(' ').some((pair) => {
    const [version, signature] = pair.split(',');
    if (version !== 'v1' || !signature) return false;
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  // CRITICAL: read the raw body as text. Calling request.json() first would
  // re-serialise the payload and break verification.
  const rawBody = await request.text();

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  const secret = process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY;

  if (!secret) {
    console.error('ANTHROPIC_WEBHOOK_SIGNING_KEY is not set');
    return NextResponse.json({ error: 'Webhook signing key not configured' }, { status: 500 });
  }

  if (!verifyClaudeSignature(rawBody, webhookId, webhookTimestamp, webhookSignature, secret)) {
    console.error('Claude Managed Agents webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('Failed to parse webhook payload:', err);
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // CMA payloads carry the event type under data.type; the top-level
  // event.type is always "event". Switch on event.data.type.
  const eventType = event?.data?.type;
  const resourceId = event?.data?.id;

  switch (eventType) {
    case 'session.status_run_started':
      console.log(`Session run started: ${resourceId}`);
      break;

    case 'session.status_idled':
      console.log(`Session idled (awaiting input): ${resourceId}`);
      // TODO: client.beta.sessions.retrieve(resourceId) and notify user
      break;

    case 'session.status_rescheduled':
      console.log(`Session rescheduled (transient error, auto-retrying): ${resourceId}`);
      break;

    case 'session.status_terminated':
      console.log(`Session terminated: ${resourceId}`);
      // TODO: alert on-call, persist final state
      break;

    case 'session.thread_created':
      console.log(`Multiagent thread created: ${resourceId}`);
      break;

    case 'session.thread_idled':
      console.log(`Multiagent thread idled: ${resourceId}`);
      break;

    case 'session.thread_terminated':
      console.log(`Multiagent thread terminated: ${resourceId}`);
      break;

    case 'session.outcome_evaluation_ended':
      console.log(`Outcome evaluation ended for session: ${resourceId}`);
      break;

    case 'vault.created':
      console.log(`Vault created: ${resourceId}`);
      break;

    case 'vault.archived':
      console.log(`Vault archived: ${resourceId}`);
      break;

    case 'vault.deleted':
      console.log(`Vault deleted: ${resourceId}`);
      break;

    case 'vault_credential.created':
      console.log(`Vault credential created: ${resourceId}`);
      break;

    case 'vault_credential.archived':
      console.log(`Vault credential archived: ${resourceId}`);
      break;

    case 'vault_credential.deleted':
      console.log(`Vault credential deleted: ${resourceId}`);
      break;

    case 'vault_credential.refresh_failed':
      console.log(`Vault credential refresh failed: ${resourceId}`);
      // TODO: trigger OAuth re-consent flow for the user
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Anything other than 2xx triggers a retry; 3xx counts as failure.
  return NextResponse.json({ received: true });
}
