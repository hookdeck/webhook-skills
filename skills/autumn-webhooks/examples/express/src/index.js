// Generated with: autumn-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Autumn delivers webhooks through Svix:
//   svix-id         message ID (same across retries)
//   svix-timestamp  Unix seconds when the message was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Manual verifier (same algorithm as svix). Use it when the svix library's fixed
 * 5-minute timestamp window is a problem: Hookdeck retries and replays resend the
 * original svix-timestamp. Checks every `v1,` entry in constant time.
 *
 * @param {Buffer|string} rawBody
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @param {string} secret - whsec_ signing secret
 * @param {number|null} toleranceSeconds - window in seconds, or null for none
 */
export function verifyManually(rawBody, headers, secret, toleranceSeconds = null) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  if (toleranceSeconds !== null && Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest('base64')
  );

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const candidate = Buffer.from(sig);
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

/** AUTUMN_TIMESTAMP_TOLERANCE_SECONDS: unset -> svix library, "off" -> no window, N -> N seconds. */
function manualToleranceFromEnv() {
  const raw = (process.env.AUTUMN_TIMESTAMP_TOLERANCE_SECONDS || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'off') return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Verify an Autumn delivery, then parse it.
 * Default: the official svix library (5-minute window, constant-time compare).
 * svix 2.x `verify()` returns nothing and throws on failure, so parse the JSON afterwards.
 *
 * @returns {object} the parsed, verified payload
 * @throws if the signature or timestamp is invalid
 */
export function verifyAutumnWebhook(rawBody, headers, secret = process.env.AUTUMN_WEBHOOK_SECRET) {
  const tolerance = manualToleranceFromEnv();
  if (tolerance === undefined) {
    new Webhook(secret).verify(rawBody, headers);
  } else if (!verifyManually(rawBody, headers, secret, tolerance)) {
    throw new Error('No matching signature found');
  }
  return JSON.parse(rawBody.toString('utf8'));
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// svix-id is the same on every retry of a message to this endpoint.
const processedMessageIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    // customer.products.updated is the older name for plan changes.
    case 'billing.updated':
    case 'customer.products.updated': {
      const changes = data.plan_changes ?? [];
      for (const change of changes) {
        const plan = (change.subscription ?? change.purchase)?.plan_id;
        console.log(`Plan ${change.action}: ${plan} for ${data.customer_id}${data.entity_id ? `/${data.entity_id}` : ''}`);
        if (change.previous_attributes?.canceled_at === null) {
          console.log(`Cancellation set for ${data.customer_id}; deprovision when the plan expires`);
        }
      }
      if (data.tags?.includes('trial_ended')) {
        console.log(`Trial ended for ${data.customer_id}`);
      }
      break;
    }
    case 'balances.limit_reached':
      console.log(`Limit reached (${data.limit_type}) on ${data.feature_id} for ${data.customer_id}`);
      break;
    case 'balances.usage_alert_triggered':
      console.log(`Usage alert "${data.usage_alert?.name}" on ${data.feature_id} for ${data.customer_id}`);
      break;
    case 'billing.auto_topup_succeeded':
      console.log(`Auto top-up granted ${data.quantity_granted} ${data.feature_id} to ${data.customer_id} (balance ${data.balance_after})`);
      break;
    case 'billing.auto_topup_failed':
      console.log(`Auto top-up failed (${data.reason}) for ${data.customer_id} on ${data.feature_id}`);
      break;
    case 'invoice.finalized':
      // The invoice fields are in `data`; fall back to the body for safety.
      console.log(`Invoice finalized: ${(data.stripe_id ?? event.stripe_id)} for ${data.customer_id ?? event.customer_id}`);
      break;
    default:
      console.log(`Unhandled Autumn event type: ${type}`);
  }
}

// express.raw({ type: '*/*' }) keeps the exact bytes for any content type.
// express.json() before verification would break the signature.
app.post('/webhooks/autumn', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.AUTUMN_WEBHOOK_SECRET) {
    console.error('AUTUMN_WEBHOOK_SECRET is not set — rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'svix-id': req.get('svix-id'),
    'svix-timestamp': req.get('svix-timestamp'),
    'svix-signature': req.get('svix-signature'),
  };
  if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
    return res.status(400).json({ error: 'Missing Svix signature headers' });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  let event;
  try {
    event = verifyAutumnWebhook(req.body, headers);
  } catch (err) {
    console.error('Autumn webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  if (processedMessageIds.has(headers['svix-id'])) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast; in production enqueue the event and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(headers['svix-id']);
  } catch (err) {
    console.error('Error handling Autumn event:', err);
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
    console.log(`Autumn webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/autumn`);
  });
}
