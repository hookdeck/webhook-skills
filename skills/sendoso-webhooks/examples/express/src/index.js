// Generated with: sendoso-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

export const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Sendoso delivers webhooks through Svix:
//   svix-id         unique message id (stable across retries -> dedupe key)
//   svix-timestamp  Unix seconds of the delivery attempt
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify a Sendoso delivery with the official Svix SDK. It rejects timestamps
 * more than 5 minutes off, checks every `v1,` entry, and compares in constant time.
 *
 * svix 2.x `verify()` returns nothing (it only throws), so parse the body
 * yourself afterwards.
 *
 * @param {string} rawBody - the exact body Sendoso sent
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @returns {object} the parsed, verified payload
 * @throws {Error} WebhookVerificationError if the signature doesn't verify,
 *   SyntaxError if the verified body isn't JSON
 */
export function verifySendosoWebhook(rawBody, headers, secret = process.env.SENDOSO_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody);
}

// In-memory state for the demo. Use Redis or your database in production.
const processedMessageIds = new Set(); // svix-id values already handled
const lastStatusChangeBySend = new Map(); // send_gid -> latest status_changed_at

/**
 * Every Sendoso event type (send.shipped, send.delivered, send.redeemed, ...)
 * shares one documented payload: { send_gid, status_changed_at }. The event
 * type isn't in the documented body, so either subscribe this endpoint only to
 * the events it should act on, or look the send up by send_gid
 * (Retrieve All Sends) to read its current status.
 */
function handleSendStatusChange({ send_gid: sendGid, status_changed_at: statusChangedAt }) {
  const previous = lastStatusChangeBySend.get(sendGid);
  if (previous && Date.parse(previous) >= Date.parse(statusChangedAt)) {
    // Retries and replays can arrive out of order; ignore stale updates.
    console.log(`Ignoring stale update for send ${sendGid} (${statusChangedAt})`);
    return { stale: true };
  }
  lastStatusChangeBySend.set(sendGid, statusChangedAt);

  // e.g. enqueue a job that fetches the send and updates your CRM.
  console.log(`Sendoso send ${sendGid} changed status at ${statusChangedAt}`);
  return { stale: false };
}

// Sendoso webhook endpoint. express.raw() keeps the exact bytes for the HMAC;
// express.json() before verification would break the signature.
app.post('/webhooks/sendoso', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SENDOSO_WEBHOOK_SECRET) {
    console.error('SENDOSO_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'svix-id': req.get('svix-id'),
    'svix-timestamp': req.get('svix-timestamp'),
    'svix-signature': req.get('svix-signature'),
  };
  if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
    return res.status(400).json({ error: 'Missing svix-id, svix-timestamp or svix-signature header' });
  }

  let payload;
  try {
    payload = verifySendosoWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Sendoso webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (typeof payload?.send_gid !== 'string' || typeof payload?.status_changed_at !== 'string') {
    return res.status(400).json({ error: 'Payload missing send_gid or status_changed_at' });
  }

  // At-least-once delivery: acknowledge duplicates without reprocessing.
  if (processedMessageIds.has(headers['svix-id'])) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Sendoso times out after 15 seconds; in production enqueue and return.
    const result = handleSendStatusChange(payload);
    processedMessageIds.add(headers['svix-id']);
    return res.status(200).json({ received: true, ...(result.stale && { stale: true }) });
  } catch (err) {
    console.error('Error handling Sendoso webhook:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Only listen when run directly (`npm start`), not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Sendoso webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sendoso`);
  });
}
