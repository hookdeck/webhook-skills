// Generated with: kombo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyKomboWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // request.text() returns the raw body exactly as received, which is what Kombo signed
  const rawBody = await request.text();
  const signature = request.headers.get('x-kombo-signature');

  // Verify first, before parsing
  if (!verifyKomboWebhook(rawBody, signature, process.env.KOMBO_WEBHOOK_SECRET)) {
    console.error('Kombo webhook signature verification failed');
    // 4xx is not retried by Kombo
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: any };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Payload shape: { id, type, data }. The event name is `type`.
  const { id, type, data } = event;
  console.log(`Received Kombo event: ${type} (${id})`);

  // Kombo may deliver an event more than once: dedupe on `id` in production.
  switch (type) {
    case 'data-changed':
      console.log('Data changed:', data?.integration_id, data?.changed_models);
      // TODO: fetch updated data from Kombo with the updated_after filter
      break;

    case 'sync-finished':
      // Deprecated by Kombo; prefer data-changed
      console.log('Sync finished:', data?.sync_id, data?.sync_state);
      break;

    case 'integration-created':
      console.log('Integration created:', data?.id, data?.tool);
      // TODO: store the integration
      break;

    case 'integration-deleted':
      console.log('Integration deleted:', data?.id);
      // TODO: remove the integration and its data
      break;

    case 'integration-state-changed':
      console.log('Integration state changed:', data?.integration_id, data?.state);
      // TODO: if INVALID, ask the customer to reconnect
      break;

    case 'connection-flow-failed':
      console.log('Connection flow failed:', data?.integration_tool, data?.log_url);
      break;

    case 'issue-status-changed':
      console.log('Issue', data?.change, data?.issue?.type);
      break;

    case 'assessment:order-received':
      console.log('Assessment ordered:', data?.id, data?.package_id);
      break;

    default:
      // Kombo adds event types over time: acknowledge unknown ones
      console.log(`Unhandled event: ${type}`);
  }

  // Acknowledge quickly with a 2xx
  return NextResponse.json({ received: true });
}
