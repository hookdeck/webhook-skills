// Generated with: gorgias-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import {
  eventName,
  parseGorgiasBody,
  verifyGorgiasAuthorization,
  type GorgiasPayload,
} from '../../../lib/gorgias';

async function handleGorgiasWebhook(request: NextRequest) {
  const secret = process.env.GORGIAS_WEBHOOK_SECRET;

  // Fail closed on misconfiguration: 500, distinguishable from a bad credential.
  if (!secret) {
    console.error('Set GORGIAS_WEBHOOK_SECRET — refusing unauthenticated webhooks');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  if (!verifyGorgiasAuthorization(authorization, secret)) {
    console.error('Gorgias webhook Authorization header mismatch');
    return NextResponse.json({ error: 'Invalid Authorization header' }, { status: 401 });
  }

  // Authenticate first, then read and parse the raw body.
  let payload: GorgiasPayload;
  try {
    payload = parseGorgiasBody(await request.text(), request.headers.get('content-type'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = eventName(payload, request.nextUrl.searchParams);
  console.log(`✓ Authenticated Gorgias webhook: ${event} (ticket ${payload.ticket_id ?? 'n/a'})`);

  // Gorgias times out after 5 seconds and never retries error responses:
  // acknowledge now, and move slow work to a queue.
  handleEvent(event, payload);

  return NextResponse.json({ received: true }, { status: 200 });
}

function handleEvent(event: string, payload: GorgiasPayload) {
  // No delivery ID: dedupe on event + ticket_id + updated_datetime if you need to.
  switch (event) {
    case 'ticket-created':
      console.log(`🎫 Ticket created: #${payload.ticket_id} "${payload.subject}" from ${payload.customer_email}`);
      break;
    case 'ticket-updated':
      console.log(`✏️  Ticket updated: #${payload.ticket_id} (status ${payload.status})`);
      break;
    case 'ticket-message-created':
      console.log(`💬 New message on ticket #${payload.ticket_id}`);
      break;
    case 'ticket-self-unsnoozed':
      console.log(`⏰ Ticket unsnoozed: #${payload.ticket_id}`);
      break;
    case 'ticket-message-failed':
      console.log(`⚠️  Message failed to send on ticket #${payload.ticket_id}`);
      break;
    case 'ticket-assignment-updated':
      console.log(`👤 Ticket #${payload.ticket_id} assigned to ${payload.assignee_email || 'nobody'}`);
      break;
    case 'ticket-status-updated':
      console.log(`🔄 Ticket #${payload.ticket_id} status is now ${payload.status}`);
      break;
    case 'ticket-handed-over':
      console.log(`🤝 Ticket handed over: #${payload.ticket_id}`);
      break;
    default:
      console.log(`Unhandled Gorgias event: ${event}`);
  }
}

// Gorgias calls the URL with whichever method the integration is configured with.
export const POST = handleGorgiasWebhook;
export const PUT = handleGorgiasWebhook;
export const PATCH = handleGorgiasWebhook;
export const DELETE = handleGorgiasWebhook;
