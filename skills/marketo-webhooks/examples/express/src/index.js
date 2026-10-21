// Generated with: marketo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

// Marketo webhooks are sent by the "Call Webhook" step in a Smart Campaign flow.
//
//   1. They are NOT signed. There is no signature header, HMAC or timestamp.
//      Authenticate them with a shared secret YOU add through
//      Webhook Actions > Set Custom Header (e.g. `X-Webhook-Secret: <hex>`)
//      and compare it in constant time.
//   2. The body is the Payload Template the admin wrote, with lead tokens like
//      {{lead.Id}}. Marketo defines no event-type strings, so each webhook
//      hard-codes an `event` field (this skill's convention).

const WEBHOOK_PATH = '/webhooks/marketo';
const DEFAULT_HEADER = 'X-Webhook-Secret';

// The `event` values hard-coded in each webhook's payload template.
const EVENTS = {
  LEAD_CREATED: 'lead_created',
  LEAD_UPDATED: 'lead_updated',
};

const app = express();

/**
 * Compare the shared secret from the custom header in constant time.
 *
 * @param {unknown} headerValue - value of the configured custom header
 * @returns {boolean} true when it matches MARKETO_WEBHOOK_SECRET
 * @throws {Error} when MARKETO_WEBHOOK_SECRET is not configured (fail closed)
 */
function verifyMarketoSecret(headerValue) {
  const expected = process.env.MARKETO_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('MARKETO_WEBHOOK_SECRET is not set');
  }
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Marketo sends no delivery ID, so build a dedupe key from fields the payload
 * template includes. Campaigns can fire the same step more than once per lead.
 */
function dedupeKey(payload) {
  const leadId = payload.lead && payload.lead.id;
  if (!leadId) return null;
  return `${payload.event}:${leadId}:${payload.campaign || ''}`;
}

// --- Event handlers ---------------------------------------------------------

async function handleLeadCreated(lead) {
  console.log(`Lead created: #${lead.id} ${lead.email ?? 'unknown'} (${lead.company ?? 'no company'})`);
  // TODO: create the record in your system. Upsert on lead.id.
}

async function handleLeadUpdated(lead) {
  console.log(`Lead updated: #${lead.id} ${lead.email ?? 'unknown'}`);
  // TODO: sync the change, upserting on lead.id.
}

/**
 * Dispatch on the `event` field set in the webhook's payload template.
 *
 * @returns {Promise<boolean>} whether the event was recognised
 */
async function dispatch(payload) {
  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : {};
  switch (payload.event) {
    case EVENTS.LEAD_CREATED:
      await handleLeadCreated(lead);
      return true;
    case EVENTS.LEAD_UPDATED:
      await handleLeadUpdated(lead);
      return true;
    default:
      // A webhook with an event value this app doesn't handle. Acknowledge it.
      console.warn(`Unhandled Marketo event: ${payload.event}`);
      return false;
  }
}

// --- Route ------------------------------------------------------------------

/**
 * Check the shared-secret header BEFORE the body is read.
 */
function requireMarketoSecret(req, res, next) {
  const headerName = process.env.MARKETO_WEBHOOK_HEADER || DEFAULT_HEADER;
  let ok;
  try {
    // req.get() is case-insensitive, matching HTTP header semantics.
    ok = verifyMarketoSecret(req.get(headerName));
  } catch (err) {
    console.error(`Marketo webhook misconfigured: ${err.message}`);
    return res.status(500).send('Webhook secret not configured');
  }
  if (!ok) {
    console.error(`Marketo webhook rejected: ${headerName} missing or wrong`);
    return res.status(401).send('Invalid webhook secret');
  }
  return next();
}

// Raw body for any content type: the webhook's Request Token Encoding (JSON or
// Form/Url) and template are admin-defined, so parse JSON ourselves only after
// the secret has been checked.
app.post(
  WEBHOOK_PATH,
  requireMarketoSecret,
  express.raw({ type: '*/*' }),
  async (req, res) => {
    let payload;
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      payload = JSON.parse(text);
    } catch {
      // Form/Url encoding, or a token value that broke the JSON template.
      return res.status(400).send('Invalid JSON');
    }

    if (!payload || typeof payload !== 'object' || typeof payload.event !== 'string') {
      // Misconfigured webhook: no `event` field in the payload template.
      return res.status(400).send('Missing event field');
    }

    console.log(
      `Marketo webhook: event=${payload.event} campaign=${payload.campaign ?? 'n/a'} key=${dedupeKey(payload)}`
    );

    try {
      await dispatch(payload);
    } catch (err) {
      console.error(`Marketo webhook processing failed: ${err.message}`);
      return res.status(500).send('Processing failed');
    }

    // Respond quickly: Marketo waits at most 30 seconds, and only a 2xx
    // response lets response mappings write back to the lead.
    return res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, EVENTS, verifyMarketoSecret, dedupeKey, dispatch };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  if (!process.env.MARKETO_WEBHOOK_SECRET) {
    console.warn('MARKETO_WEBHOOK_SECRET is not set: every delivery will get a 500 (fail closed).');
  }
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}
