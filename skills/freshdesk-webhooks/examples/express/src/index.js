// Generated with: freshdesk-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

// Freshdesk webhooks are a "Trigger Webhook" action inside automation rules
// (Admin -> Workflows -> Automations -> Ticket Creation / Ticket Updates).
//
//   1. They are NOT signed. There is no signature header, HMAC or timestamp.
//      Authenticate them with a shared secret YOU add under "Add custom headers"
//      (e.g. `X-Freshdesk-Webhook-Secret: <hex>`) and compare it in constant time.
//   2. The body is whatever the admin wrote in the rule's Advanced content, with
//      placeholders like {{ticket.id}}. Freshdesk defines no event-type strings,
//      so each rule hard-codes an `event` field (this skill's convention).

const WEBHOOK_PATH = '/webhooks/freshdesk';
const DEFAULT_HEADER = 'X-Freshdesk-Webhook-Secret';

// The `event` values set in each rule's payload template.
const EVENTS = {
  TICKET_CREATED: 'ticket_created',
  TICKET_UPDATED: 'ticket_updated',
};

const app = express();

/**
 * Compare the shared secret from the custom header in constant time.
 *
 * @param {unknown} headerValue - value of the configured custom header
 * @returns {boolean} true when it matches FRESHDESK_WEBHOOK_SECRET
 * @throws {Error} when FRESHDESK_WEBHOOK_SECRET is not configured (fail closed)
 */
function verifyFreshdeskSecret(headerValue) {
  const expected = process.env.FRESHDESK_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('FRESHDESK_WEBHOOK_SECRET is not set');
  }
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Freshdesk has no delivery ID and retries failures every 30 minutes (48 calls),
 * so build a dedupe key from fields the rule's payload includes.
 */
function dedupeKey(payload) {
  const ticketId = payload.ticket && payload.ticket.id;
  if (!ticketId) return null;
  const status = payload.ticket.status || '';
  return `${payload.event}:${ticketId}:${status}`;
}

// --- Event handlers ---------------------------------------------------------

async function handleTicketCreated(ticket) {
  // Placeholder values arrive as strings; coerce what you need.
  console.log(`Ticket created: #${ticket.id} "${ticket.subject ?? ''}" from ${ticket.requester_email ?? 'unknown'}`);
  // TODO: create the record in your system. Re-fetch the ticket from
  // GET https://<domain>.freshdesk.com/api/v2/tickets/{id} before acting on it.
}

async function handleTicketUpdated(ticket) {
  console.log(`Ticket updated: #${ticket.id} status=${ticket.status ?? 'n/a'} priority=${ticket.priority ?? 'n/a'}`);
  // TODO: sync the change, upserting on ticket.id.
}

/**
 * Dispatch on the `event` field set in the rule's payload template.
 *
 * @returns {Promise<boolean>} whether the event was recognised
 */
async function dispatch(payload) {
  const ticket = payload.ticket && typeof payload.ticket === 'object' ? payload.ticket : {};
  switch (payload.event) {
    case EVENTS.TICKET_CREATED:
      await handleTicketCreated(ticket);
      return true;
    case EVENTS.TICKET_UPDATED:
      await handleTicketUpdated(ticket);
      return true;
    default:
      // A rule with an event value this app doesn't handle. Acknowledge it so
      // Freshdesk doesn't retry 48 times.
      console.warn(`Unhandled Freshdesk event: ${payload.event}`);
      return false;
  }
}

// --- Route ------------------------------------------------------------------

/**
 * Check the shared-secret header BEFORE the body is read.
 */
function requireFreshdeskSecret(req, res, next) {
  const headerName = process.env.FRESHDESK_WEBHOOK_HEADER || DEFAULT_HEADER;
  let ok;
  try {
    // req.get() is case-insensitive, matching Freshdesk's header handling.
    ok = verifyFreshdeskSecret(req.get(headerName));
  } catch (err) {
    console.error(`Freshdesk webhook misconfigured: ${err.message}`);
    return res.status(500).send('Webhook secret not configured');
  }
  if (!ok) {
    console.error(`Freshdesk webhook rejected: ${headerName} missing or wrong`);
    return res.status(401).send('Invalid webhook secret');
  }
  return next();
}

// Raw body for any content type: the rule chooses the encoding, and we parse
// JSON ourselves only after the secret has been checked.
app.post(
  WEBHOOK_PATH,
  requireFreshdeskSecret,
  express.raw({ type: '*/*' }),
  async (req, res) => {
    let payload;
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      payload = JSON.parse(text);
    } catch {
      // XML encoding, or a placeholder value that broke the JSON template.
      return res.status(400).send('Invalid JSON');
    }

    if (!payload || typeof payload !== 'object' || typeof payload.event !== 'string') {
      // Misconfigured rule: no `event` field in the payload template.
      return res.status(400).send('Missing event field');
    }

    console.log(
      `Freshdesk webhook: event=${payload.event} triggered_event=${payload.triggered_event ?? 'n/a'} key=${dedupeKey(payload)}`
    );

    try {
      await dispatch(payload);
    } catch (err) {
      console.error(`Freshdesk webhook processing failed: ${err.message}`);
      // Non-2xx makes Freshdesk retry every 30 minutes (48 calls in total).
      return res.status(500).send('Processing failed');
    }

    return res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, EVENTS, verifyFreshdeskSecret, dedupeKey, dispatch };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  if (!process.env.FRESHDESK_WEBHOOK_SECRET) {
    console.warn('FRESHDESK_WEBHOOK_SECRET is not set: every delivery will get a 500 (fail closed).');
  }
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}
