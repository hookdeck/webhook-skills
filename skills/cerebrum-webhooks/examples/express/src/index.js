// Generated with: cerebrum-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Cerebrum delivers webhooks through Svix (Standard Webhooks):
//   svix-id         unique message ID (stable across retries)
//   svix-timestamp  Unix seconds when the attempt was sent
//   svix-signature  one or more space-separated "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${id}.${timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// The same three values can arrive as webhook-id / webhook-timestamp /
// webhook-signature; Hookdeck reads either set, and so does this handler.
// ---------------------------------------------------------------------------

/**
 * Pick one complete set of signature headers. svix-* wins when svix-id is
 * present, otherwise webhook-* is used (the same rule Hookdeck applies).
 * Returns the three values under the names the svix library reads, or null
 * if any of them is missing.
 *
 * @param {(name: string) => string | undefined} get - header lookup
 */
export function getSignatureHeaders(get) {
  const prefix = get('svix-id') ? 'svix' : 'webhook';
  const id = get(`${prefix}-id`);
  const timestamp = get(`${prefix}-timestamp`);
  const signature = get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature };
}

/**
 * Verify a Cerebrum delivery with the svix library. It recomputes the
 * HMAC-SHA256 over `{id}.{timestamp}.{rawBody}`, compares every `v1,` entry in
 * constant time, and rejects timestamps more than 5 minutes from now. The
 * 5-minute window also applies to Hookdeck retries and replays, which resend
 * the original timestamp; see references/verification.md for a manual verifier
 * without the window.
 *
 * @param {string} rawBody - the exact body Cerebrum sent
 * @param {object} headers - from getSignatureHeaders()
 * @param {string} secret - the whsec_ signing secret
 * @returns {object} the parsed, verified payload
 * @throws {Error} if verification fails or the body is not JSON
 */
export function verifyCerebrumWebhook(rawBody, headers, secret = process.env.CEREBRUM_WEBHOOK_SECRET) {
  // svix 2.x verify() returns nothing, so parse after it passes.
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody);
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on the message ID header: it is the same on every retry.
const processedMessageIds = new Set();

// Payload: { id, idType, additionalMetadata, event, eventDate, svixAppId, metadata }
// `metadata.delta` is a JSON-Patch-style change list on some order updates.
function handleEvent(payload) {
  const { event, id, idType, metadata } = payload;

  switch (event) {
    // --- Orders ------------------------------------------------------------
    case 'ORDER_STATUS_CHANGE':
    case 'ORDER_SCORE_CHANGE':
    case 'ORDER_CUSTOM_SCORE_CHANGE':
      console.log(`${event}: ${idType} ${id}`, metadata?.delta ? `(${metadata.delta.length} changes)` : '');
      break;
    case 'ORDER_DISPUTE_RESOLVED':
      console.log(`Order dispute resolved: ${idType} ${id}`);
      break;

    // --- Vouchers (vID) ----------------------------------------------------
    case 'VOUCHER_STARTED':
    case 'VOUCHER_REDEEMED':
    case 'VOUCHER_EXPIRED':
      console.log(`${event}: ${idType} ${id}`);
      break;

    // --- Monitoring and Beam -----------------------------------------------
    case 'MONITORING_REPORT_GENERATED':
      console.log(`Monitoring report generated: ${idType} ${id}`);
      break;
    case 'BEAM_INPUT_CREATED':
      console.log(`Beam input created: ${idType} ${id}`);
      break;

    default:
      // The documented list may not be exhaustive: acknowledge, don't fail.
      console.log(`Unhandled Cerebrum event: ${event}`);
  }
}

// express.raw() with '*/*' keeps the exact bytes for any content type;
// express.json() would re-serialise the body and break verification.
app.post('/webhooks/cerebrum', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.CEREBRUM_WEBHOOK_SECRET) {
    console.error('CEREBRUM_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = getSignatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload;
  try {
    payload = verifyCerebrumWebhook(rawBody, headers);
  } catch (err) {
    console.error('Cerebrum webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the same message ID; acknowledge duplicates with 200.
  const messageId = headers['svix-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Cerebrum needs a 2xx within 30 seconds. In production, enqueue the
    // payload here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Cerebrum event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server = app.listen(PORT, () => {
    console.log(`Cerebrum webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cerebrum`);
  });
}

export { app, server };
