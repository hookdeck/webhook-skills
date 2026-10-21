// Generated with: nango-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { Nango } from '@nangohq/node';
import type { NangoAuthWebhookBody, NangoSyncWebhookBody } from '@nangohq/node';

// @nangohq/node doesn't re-export the forward body type, so mirror it here
interface NangoForwardWebhookBody {
  type: 'forward';
  from: string;
  providerConfigKey: string;
  connectionId?: string;
  payload: unknown;
  unverified?: true;
}

let nango: Nango | undefined;

// The SDK verifies with `webhookSigningKey` (Environment Settings > Webhooks >
// Signing key). The constructor also requires an API key.
function getNango(): Nango {
  if (!nango) {
    nango = new Nango({
      apiKey: process.env.NANGO_API_KEY!,
      webhookSigningKey: process.env.NANGO_WEBHOOK_SIGNING_KEY!,
    });
  }
  return nango;
}

function handleAuth(webhook: NangoAuthWebhookBody) {
  const { operation, connectionId, providerConfigKey } = webhook;

  switch (operation) {
    case 'creation':
      if (webhook.success) {
        // Required: save connectionId against the user/org that started the flow
        console.log(`Connection created: ${connectionId} (${providerConfigKey})`, webhook.tags);
      } else {
        console.log(`Connection creation failed (${providerConfigKey}):`, webhook.error);
      }
      break;
    case 'override':
      console.log(`Connection re-authorized: ${connectionId} (success=${webhook.success})`);
      break;
    case 'refresh':
      if (webhook.success) {
        console.log(`Connection recovered after refresh failure: ${connectionId}`);
      } else {
        console.log(`Token refresh failed for ${connectionId}:`, webhook.error);
      }
      break;
    case 'deletion':
      console.log(`Connection deleted: ${connectionId}`);
      break;
    default:
      console.log(`Unhandled auth operation: ${operation}`);
  }
}

function handleSync(webhook: NangoSyncWebhookBody) {
  const { connectionId, syncName, model } = webhook;

  if (!webhook.success) {
    console.log(`Sync ${syncName} failed for ${connectionId}:`, webhook.error);
    return;
  }

  // checkpoints may be missing or null; treat that (or from === null) as a full sync
  const isFullSync = !webhook.checkpoints || webhook.checkpoints.from === null;
  console.log(`Sync ${syncName} (${model}) succeeded for ${connectionId}`, {
    modifiedAfter: webhook.modifiedAfter,
    results: webhook.responseResults,
    isFullSync,
  });
  // Fetch changed records here, e.g. getNango().listRecords({ ... }), using a cursor
}

function handleForward(webhook: NangoForwardWebhookBody) {
  if (webhook.unverified) {
    // Nango could not check the external provider's signature; treat as untrusted
    console.warn(`Unverified forward from ${webhook.from}`);
  }
  console.log(`Forwarded ${webhook.from} webhook for connection ${webhook.connectionId ?? '(unattributed)'}`);
}

export async function POST(request: NextRequest) {
  if (!process.env.NANGO_WEBHOOK_SIGNING_KEY || !process.env.NANGO_API_KEY) {
    console.error('NANGO_WEBHOOK_SIGNING_KEY and NANGO_API_KEY must be set');
    return NextResponse.json({ error: 'Webhook verification not configured' }, { status: 500 });
  }

  if (!request.headers.get('x-nango-hmac-sha256')) {
    return NextResponse.json({ error: 'Missing X-Nango-Hmac-Sha256 header' }, { status: 400 });
  }

  // Verify against the raw body string, never re-serialised JSON
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());
  if (!getNango().verifyIncomingWebhookRequest(rawBody, headers)) {
    console.error('Nango webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let webhook: any;
  try {
    webhook = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  switch (webhook?.type) {
    case 'auth':
      handleAuth(webhook as NangoAuthWebhookBody);
      break;
    case 'sync':
      handleSync(webhook as NangoSyncWebhookBody);
      break;
    case 'forward':
      handleForward(webhook as NangoForwardWebhookBody);
      break;
    case 'async_action':
      console.log(`Async action finished for ${webhook.connectionId}`);
      break;
    default:
      // New types are added without notice, and unattributed forwards arrive
      // as the raw provider payload without a Nango wrapper. Acknowledge them.
      console.log('Unhandled Nango webhook:', webhook?.type ?? '(raw forwarded payload)');
  }

  return NextResponse.json({ received: true });
}
