// Generated with: scalekit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Scalekit (scalekit.com) signs webhooks with Standard Webhooks:
//   webhook-id         the delivery ID (stable across retries)
//   webhook-timestamp  Unix seconds when this attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface ScalekitEvent {
  spec_version: string;
  id: string; // evt_..., unique per event (differs from webhook-id)
  type: string; // e.g. "organization.directory.user_created"
  occurred_at: string;
  environment_id: string;
  organization_id?: string; // not sent on user.* events
  object?: string; // names the data's type (e.g. "DirectoryUser"); omitted on domain events
  data: Record<string, any>;
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the signature headers. Standard Webhooks uses webhook-*; when
 * webhook-id is absent, fall back to the svix-* names, as Hookdeck does.
 * Returns them under the webhook-* names the library expects.
 */
function readSignatureHeaders(get: (name: string) => string | null): Partial<SignatureHeaders> {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': get(`${prefix}-id`) ?? undefined,
    'webhook-timestamp': get(`${prefix}-timestamp`) ?? undefined,
    'webhook-signature': get(`${prefix}-signature`) ?? undefined,
  };
}

/**
 * Verify a Scalekit delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 */
function verifyScalekitWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.SCALEKIT_WEBHOOK_SECRET as string
): ScalekitEvent {
  return new Webhook(secret).verify(rawBody, headers) as ScalekitEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The top-level evt_ id (and webhook-id) is the same on every retry.
const processedEventIds = new Set<string>();

function handleEvent(event: ScalekitEvent): void {
  const { type, data = {} } = event;

  switch (type) {
    // --- Organizations -----------------------------------------------------
    case 'organization.created':
    case 'organization.updated':
    case 'organization.deleted':
      console.log(`${type}: ${data.id} (${data.display_name})`);
      break;

    // --- Directory sync (SCIM) ---------------------------------------------
    case 'organization.directory_enabled':
    case 'organization.directory_disabled':
      console.log(`${type}: ${event.organization_id}`);
      break;
    case 'organization.directory.user_created':
    case 'organization.directory.user_updated':
      console.log(`${type}: ${data.id} (${data.email}, active=${data.active})`);
      break;
    case 'organization.directory.user_deleted':
      console.log(`Directory user deleted: ${data.id} (${data.email})`);
      break;
    case 'organization.directory.group_created':
    case 'organization.directory.group_updated':
    case 'organization.directory.group_deleted':
      console.log(`${type}: ${data.id} (${data.display_name})`);
      break;

    // --- SSO connections ---------------------------------------------------
    case 'organization.sso_enabled':
    case 'organization.sso_disabled':
      console.log(`${type}: ${event.organization_id}`);
      break;

    // --- Users (no organization_id on user.* events) -----------------------
    case 'user.signup':
    case 'user.login':
    case 'user.logout':
      console.log(`${type}: ${data.id ?? data.user?.id}`);
      break;
    case 'user.organization_membership_created':
    case 'user.organization_membership_updated':
    case 'user.organization_membership_deleted':
      console.log(`${type}: ${data.id ?? data.user?.id}`);
      break;

    // --- Roles -------------------------------------------------------------
    case 'role.created':
    case 'role.updated':
      console.log(`${type}: ${data.name ?? data.id}`);
      break;

    default:
      // Scalekit's event list may grow: acknowledge, don't fail.
      console.log(`Unhandled Scalekit event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SCALEKIT_WEBHOOK_SECRET) {
    console.error('SCALEKIT_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = readSignatureHeaders((name) => request.headers.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json(
      { error: 'Missing Standard Webhooks signature headers' },
      { status: 400 }
    );
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: ScalekitEvent;
  try {
    event = verifyScalekitWebhook(rawBody, headers as SignatureHeaders);
  } catch (err) {
    console.error('Scalekit webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same event id and webhook-id; acknowledge duplicates with 200.
  const eventId = event.id || (headers['webhook-id'] as string);
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Scalekit needs a 2xx within 30 seconds. In production, enqueue the event
    // here and process it asynchronously. Deliveries are unordered: compare
    // event.occurred_at before overwriting newer data.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Scalekit event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
