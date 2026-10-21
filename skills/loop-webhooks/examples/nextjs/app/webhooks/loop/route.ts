// Generated with: loop-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Loop payloads are flat: eventType, eventId and eventCreatedAt sit at the top
// level next to the entity QIDs (paymentQid, shipmentJobQid, ...).
type LoopEvent = {
  eventType: string;
  eventId?: string;
  eventCreatedAt?: string;
  [field: string]: unknown;
};

// Loop delivers at least once and recommends deduplicating on the payload's
// eventId (stable across resends), NOT the svix-id header (per delivery
// message). In-memory for the example; use a database or Redis in production.
const processedEventIds = new Set<string>();

export async function POST(request: Request) {
  const secret = process.env.LOOP_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('LOOP_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body — Loop signs the exact string it sent.
  const rawBody = await request.text();

  try {
    // HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`, base64,
    // compared in constant time against every `v1,` entry. Also rejects
    // timestamps more than 5 minutes from now.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('Loop webhook verification failed:', message);
    const detail = /timestamp/i.test(message) ? 'Timestamp outside tolerance' : 'Invalid signature';
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  // Verified — only now parse the body.
  let event: LoopEvent;
  try {
    event = JSON.parse(rawBody) as LoopEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // eventId is optional per Loop's docs ("may carry"); dedupe when present.
  if (event.eventId) {
    if (processedEventIds.has(event.eventId)) {
      console.log(`Duplicate Loop event ${event.eventId}, skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    processedEventIds.add(event.eventId);
  }

  // Treat payloads as notifications and refetch current state from the Loop API.
  switch (event.eventType) {
    case 'payment.initiated':
    case 'payment.completed':
    case 'payment.failed':
      console.log(`Payment ${event.paymentDisplayId} (${event.paymentQid}): ${event.eventType}`);
      break;
    case 'receivable-invoice.created':
    case 'receivable-invoice.finalized':
    case 'receivable-invoice.voided':
      console.log(`Receivable invoice ${event.receivableInvoiceQid}: ${event.eventType}`);
      break;
    case 'payable-invoice-review.completed':
      console.log(`Payable invoice ${event.payableInvoiceQid} review: ${event.outcome}`);
      break;
    case 'payable-invoice.shipment-job-linked':
    case 'payable-invoice.shipment-job-unlinked':
      console.log(`Payable invoice ${event.payableInvoiceQid} / shipment job ${event.shipmentJobQid}: ${event.eventType}`);
      break;
    case 'shipment-job.normalized':
    case 'shipment-job.rerated':
      console.log(`Shipment job ${event.shipmentJobQid}: ${event.eventType}`);
      break;
    case 'shipment-job-artifact.assigned':
    case 'shipment-job-artifact.unassigned':
    case 'shipment-job-artifact.assessed':
    case 'shipment-job-artifact.unassessed':
      console.log(`Artifact ${event.artifactQid} on shipment job ${event.shipmentJobQid}: ${event.eventType}`);
      break;
    case 'artifact.root-ingestion-completed':
      console.log(`Artifact ingestion completed: ${event.artifactQid}`);
      break;
    case 'business-exception.created':
    case 'business-exception.resolved':
    case 'business-exception.reopened':
    case 'business-exception.deleted':
      console.log(`Exception "${event.exceptionName}" on ${event.targetEntityQid}: ${event.eventType}`);
      break;
    case 'quick-pay-relationship.revised':
      console.log(`QuickPay relationship revised: payee ${event.payeeOrganizationQid}, payor ${event.payorOrganizationQid}`);
      break;
    case 'test-event.created':
      console.log('Loop test event received');
      break;
    default:
      console.log(`Unhandled Loop event type: ${event.eventType}`);
  }

  return NextResponse.json({ received: true, eventType: event.eventType });
}
