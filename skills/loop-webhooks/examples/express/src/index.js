// Generated with: loop-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { Webhook } from 'svix'; // ESM-only since svix 2.x

export const app = express();
const PORT = process.env.PORT || 3000;

// Loop delivers at least once and recommends deduplicating on the payload's
// eventId (stable across resends), NOT the svix-id header (per delivery
// message). In-memory for the example; use a database or Redis in production.
const processedEventIds = new Set();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact raw body bytes Loop signed.
app.post('/webhooks/loop', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.LOOP_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('LOOP_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`, base64,
    // compared in constant time against every `v1,` entry. Also rejects
    // timestamps more than 5 minutes from now.
    new Webhook(secret).verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Loop webhook verification failed:', err.message);
    const detail = /timestamp/i.test(err.message || '') ? 'Timestamp outside tolerance' : 'Invalid signature';
    return res.status(400).json({ error: detail });
  }

  // Verified — only now parse the body.
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // eventId is optional per Loop's docs ("may carry"); dedupe when present.
  if (event.eventId) {
    if (processedEventIds.has(event.eventId)) {
      console.log(`Duplicate Loop event ${event.eventId}, skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }
    processedEventIds.add(event.eventId);
  }

  // Loop payloads are flat: eventType, eventId, eventCreatedAt + QIDs.
  // Treat them as notifications and refetch current state from the Loop API.
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

  res.status(200).json({ received: true, eventType: event.eventType });
});

// Start the server only when run directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Loop webhook server on http://localhost:${PORT}/webhooks/loop`);
  });
}
