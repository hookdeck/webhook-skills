// Generated with: gorgias-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * GORGIAS WEBHOOK AUTHENTICATION
 *
 * Gorgias HTTP integrations are NOT signed: no signature header, no HMAC, no
 * timestamp. You add a header to the integration yourself, here
 *
 *   Authorization: Bearer <GORGIAS_WEBHOOK_SECRET>
 *
 * and Gorgias sends it verbatim. Compare the WHOLE header value in constant time.
 */
function verifyGorgiasAuthorization(header, secret) {
  if (!header || !secret) return false;
  const a = Buffer.from(String(header), 'utf8');
  const b = Buffer.from(`Bearer ${secret}`, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Parse the rendered body template. Gorgias sends either application/json or
 * application/x-www-form-urlencoded, depending on the integration's
 * "Request content type". An empty body (e.g. a DELETE) parses to {}.
 */
function parseGorgiasBody(rawBody, contentType = '') {
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : '';
  if (!text.trim()) return {};
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  return JSON.parse(text);
}

/**
 * Gorgias doesn't say which trigger fired. This example expects the trigger key
 * hard-coded in the template ("event": "ticket-created"), or in the URL
 * (?event=ticket-created), with one integration per trigger.
 */
function eventName(payload, query = {}) {
  if (payload && typeof payload.event === 'string') return payload.event;
  if (typeof query.event === 'string') return query.event;
  return 'unknown';
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Gorgias webhook endpoint.
 *
 * Gorgias may call it with POST, PUT, PATCH or DELETE (whatever the integration
 * is configured with). express.raw() keeps the body unparsed so the handler
 * authenticates BEFORE it parses.
 */
function handleGorgiasWebhook(req, res) {
  const secret = process.env.GORGIAS_WEBHOOK_SECRET;

  // Fail closed on misconfiguration: 500, distinguishable from a bad credential.
  if (!secret) {
    console.error('Set GORGIAS_WEBHOOK_SECRET — refusing unauthenticated webhooks');
    return res.status(500).json({ error: 'Webhook authentication not configured' });
  }

  const authorization = req.headers['authorization'];
  if (!authorization) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  if (!verifyGorgiasAuthorization(authorization, secret)) {
    console.error('Gorgias webhook Authorization header mismatch');
    return res.status(401).json({ error: 'Invalid Authorization header' });
  }

  let payload;
  try {
    payload = parseGorgiasBody(req.body, req.headers['content-type']);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const event = eventName(payload, req.query);
  console.log(`✓ Authenticated Gorgias webhook: ${event} (ticket ${payload.ticket_id ?? 'n/a'})`);

  // Gorgias times out after 5 seconds and never retries error responses:
  // acknowledge now, and move slow work to a queue.
  handleEvent(event, payload);

  res.status(200).json({ received: true });
}

function handleEvent(event, payload) {
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

app
  .route('/webhooks/gorgias')
  .all(express.raw({ type: '*/*' }))
  .post(handleGorgiasWebhook)
  .put(handleGorgiasWebhook)
  .patch(handleGorgiasWebhook)
  .delete(handleGorgiasWebhook);

module.exports = { app, verifyGorgiasAuthorization, parseGorgiasBody, eventName };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Gorgias webhook server listening on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/gorgias`);
  });
}
