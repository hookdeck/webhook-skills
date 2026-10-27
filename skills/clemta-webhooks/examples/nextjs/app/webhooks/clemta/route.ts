// Generated with: clemta-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Clemta sends the Standard Webhooks webhook-* headers; Hookdeck also reads svix-* when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    id: headers.get(`${prefix}-id`),
    timestamp: headers.get(`${prefix}-timestamp`),
    signature: headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.CLEMTA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CLEMTA_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id, timestamp, signature } = readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Clemta signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, entry (v1a is skipped)
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Clemta webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  // Parse only after the signature check
  let event: { type?: string; data?: { object?: Record<string, any> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Body is { type, data }; data.object is the resource, and its own `object` field names the kind
  const type = event.type;
  const resource = event.data?.object;
  // webhook-id is the event id, stable across retries: use it to deduplicate
  console.log(`Received Clemta webhook ${id}: ${type}`);

  switch (type) {
    case 'company.created':
    case 'company.verified':
    case 'company.incorporated':
    case 'company.onboarding.completed':
    case 'company.updated':
    case 'company.entitlements.changed':
      console.log(`${type}:`, resource?.id);
      break;
    case 'company.status.changed':
      // Branch on the company's status (in_progress, active, cancelled), not on this type
      console.log('Company status changed:', resource?.id, resource?.status);
      break;
    case 'company.name.changed':
      console.log('Company renamed:', resource?.id, resource?.name);
      break;
    case 'company.ein.assigned':
      console.log('EIN assigned:', resource?.id, resource?.ein);
      break;
    case 'company.document.received':
      console.log('Owner document received for company:', resource?.id);
      break;
    case 'company.dissolved':
      // Terminal: recurring services stop renewing and open requirements close
      console.log('Company dissolved:', resource?.id);
      break;
    case 'tax_filing.created':
    case 'tax_filing.status.changed':
      console.log(`${type}:`, resource?.id, resource?.status, resource?.progress);
      break;
    case 'service_order.status.changed':
      // Fires on creation and on every fulfilment step, including cancellation: branch on status
      console.log('Service order status changed:', resource?.id, resource?.status);
      break;
    case 'service_order.completed':
      // Fires again if the order reopens and completes once more: handle repeats idempotently
      console.log('Service order completed:', resource?.id);
      break;
    case 'service_order.updated':
    case 'service_order.renewal_canceled':
    case 'service_order.renewal_cancel_denied':
      console.log(`${type}:`, resource?.id);
      break;
    case 'service_order.quoted':
      // Accept before quote.expires_at; nothing bills until you do
      console.log('Service order quoted:', resource?.id, resource?.quote?.expires_at);
      break;
    case 'requirement.created':
    case 'requirement.fulfilled':
      console.log(`${type}:`, resource?.id);
      break;
    case 'requirement.canceled':
      console.log('Requirement canceled:', resource?.id, resource?.cancel_reason);
      break;
    case 'requirement.signature.viewed':
    case 'requirement.signature.signed':
      // Once per signer; the requirement resolves with requirement.fulfilled when the last signer signs
      console.log(`${type}:`, resource?.id);
      break;
    case 'file.created':
      // Download the bytes from the file's content endpoint
      console.log('File created:', resource?.id);
      break;
    case 'calendar.reminder':
      // Once per reminder point; relay it under your own brand, Clemta sends no mail to your customer
      console.log('Calendar reminder:', resource?.id, resource?.due_at, resource?.remind_at);
      break;
    case 'invoice.finalized':
      console.log('Invoice finalized:', resource?.id);
      break;
    default:
      console.log('Unhandled event type:', type);
  }
  return NextResponse.json({ success: true, type: type ?? null });
}
