// Generated with: act-on-webhooks skill
// https://github.com/hookdeck/webhook-skills

import dotenv from 'dotenv';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Act-On delivers outgoing webhooks through an embedded Svix portal. Act-On's
// pages don't name the headers, but they are the Svix defaults:
//   svix-id         message ID, the same on every retry
//   svix-timestamp  Unix seconds of this delivery attempt
//   svix-signature  one or more space-separated "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the Signing Secret (after its `whsec_` prefix, if any).
// The svix-* names are inferred, so the same values sent as webhook-id /
// webhook-timestamp / webhook-signature (Svix's other prefix) are accepted too.
// ---------------------------------------------------------------------------

/**
 * Verify an Act-On delivery with the Svix library. It checks the timestamp
 * (fixed 5-minute tolerance), recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so the JSON is
 * parsed here after verification succeeds.
 *
 * @param {Buffer|string} rawBody - the exact bytes Act-On sent
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @param {string} secret - the endpoint's Signing Secret from the Act-On portal
 * @returns {object} the parsed, verified payload
 * @throws {WebhookVerificationError} if the signature or timestamp is invalid
 */
export function verifyActOnWebhook(rawBody, headers, secret = process.env.ACT_ON_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody.toString('utf8'));
}

/**
 * Act-On payloads are each event's own object with NO event-type field, so
 * the type is inferred from the payload's shape. Returns the candidate event
 * types: one entry when the shape is unique, several when Act-On sends
 * identical shapes for different events (subscribe a separate endpoint per
 * event, or per group, if you need to tell those apart).
 */
export function classifyPayload(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [];
  if ('formId' in p && 'formName' in p) return ['form.submitted'];
  if ('startedTime' in p) return ['automated-program.started'];
  if ('stoppedTime' in p) return ['automated-program.stopped'];
  if ('leadScore' in p && 'scoresheetId' in p) return ['contact-lead-score.upper-threshold-surpassed'];
  if ('scheduledTimestamp' in p) return ['email-message.scheduled'];
  if ('categoryChecked' in p) {
    return [p.categoryChecked ? 'subscription-category.opt-in' : 'subscription-category.opt-out'];
  }
  if ('hasOptedOut' in p) {
    return [p.hasOptedOut ? 'contact-opt.global-opt-out' : 'contact-opt.global-opt-in'];
  }
  if ('recId' in p && 'srcId' in p) return ['contact-email.marked-as-spam'];
  if ('isHardBounce' in p) {
    return ['msgId' in p || 'categoryReason' in p ? 'contact-bounce.hard' : 'contact-bounce.soft'];
  }
  if ('crmDisplayName' in p) return ['crm.connected', 'crm.disconnected'];
  if ('contact' in p && 'contactReportLink' in p) return ['contact.added', 'contact.updated'];
  if ('checked' in p && 'id' in p && 'name' in p) {
    return ['subscription-category.added', 'subscription-category.deleted', 'subscription-category.updated'];
  }
  return [];
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Act-On's body has no event ID, so dedupe on svix-id (same on every retry).
const processedMessageIds = new Set();

function handleEvent(payload) {
  const candidates = classifyPayload(payload);

  switch (candidates.join('|')) {
    case 'contact.added|contact.updated':
      // Same shape for both events. Use one endpoint per event type to tell them apart.
      console.log(`Contact added or updated: ${payload.email} (${payload.contactReportLink})`);
      break;
    case 'contact-bounce.hard':
      console.log(`Hard bounce: ${payload.email} (${payload.categoryReason}) for message ${payload.msgId}`);
      break;
    case 'contact-bounce.soft':
      console.log(`Soft bounce: ${payload.email}`);
      break;
    case 'contact-email.marked-as-spam':
      console.log(`Spam complaint: ${payload.email} on message ${payload.msgId}`);
      break;
    case 'contact-opt.global-opt-out':
      console.log(`Global opt-out: ${payload.email}`);
      break;
    case 'contact-opt.global-opt-in':
      console.log(`Global opt-in: ${payload.email}`);
      break;
    case 'contact-lead-score.upper-threshold-surpassed':
      console.log(`Lead score ${payload.leadScore} passed the threshold on ${payload.scoresheetId}: ${payload.email}`);
      break;
    case 'form.submitted':
      console.log(`Form submitted: ${payload.formName} (${payload.formId}) by ${payload.contact?.email}`);
      break;
    case 'automated-program.started':
      console.log(`Automated Program started: ${payload.name}`);
      break;
    case 'automated-program.stopped':
      console.log(`Automated Program stopped: ${payload.name}`);
      break;
    case 'subscription-category.opt-in':
    case 'subscription-category.opt-out':
      console.log(`${candidates[0]}: ${payload.email} -> ${payload.categoryName}`);
      break;
    case 'subscription-category.added|subscription-category.deleted|subscription-category.updated':
      console.log(`Subscription category changed: ${payload.name} (checked=${payload.checked})`);
      break;
    case 'crm.connected|crm.disconnected':
      console.log(`CRM connection event: ${payload.crmDisplayName} (${payload.detail})`);
      break;
    case 'email-message.scheduled':
      console.log(`Email scheduled: "${payload.title}" to ${payload.numTargetedRecipients} recipients`);
      break;
    default:
      console.log('Unrecognised Act-On payload shape:', Object.keys(payload ?? {}));
  }
}

// Act-On webhook endpoint. Act-On only sends POST.
// express.raw({ type: '*/*' }) keeps the exact bytes for the HMAC whatever the
// content type is. express.json() before verification would break the signature.
app.post('/webhooks/act-on', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.ACT_ON_WEBHOOK_SECRET) {
    console.error('ACT_ON_WEBHOOK_SECRET is not set - rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Fall back to the webhook-* prefix when the svix-* headers are absent.
  const headers = {
    'svix-id': req.get('svix-id') ?? req.get('webhook-id'),
    'svix-timestamp': req.get('svix-timestamp') ?? req.get('webhook-timestamp'),
    'svix-signature': req.get('svix-signature') ?? req.get('webhook-signature'),
  };
  if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
    return res.status(400).json({ error: 'Missing Svix signature headers' });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  let payload;
  try {
    payload = verifyActOnWebhook(req.body, headers);
  } catch (err) {
    console.error('Act-On webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (at-least-once delivery) - acknowledge with 200.
  const messageId = headers['svix-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the payload here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Act-On event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export { app };

// Start the server only when run directly (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Act-On webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/act-on`);
  });
}
