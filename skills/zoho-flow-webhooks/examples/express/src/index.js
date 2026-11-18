// Generated with: zoho-flow-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Zoho Flow's Send Webhook action is NOT signed. Have it send a secret header:
// an API Key auth profile with header placement (Parameter Name = header name),
// or a header Param Name / Param Value on an action with No Authentication.
// The method is yours to choose (GET/PUT/POST/PATCH/DELETE), so all are routed.
// A static credential authenticates the sender, not the body, and gives no
// replay protection: use HTTPS and rotate the value if it leaks.
// ---------------------------------------------------------------------------

const DEFAULT_HEADER = 'X-Webhook-Secret';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * @param {object} headers - Node/Express request headers (names are lowercased)
 * @param {string} name - the auth profile's Parameter Name (header placement)
 * @param {string|undefined} secret - the exact, whole key from the connection
 * @returns {boolean}
 */
function verifyZohoFlowRequest(
  headers,
  name = process.env.ZOHO_FLOW_WEBHOOK_HEADER || DEFAULT_HEADER,
  secret = process.env.ZOHO_FLOW_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

/**
 * The body is whatever the action sends (Content-Type is "typically JSON").
 * Returns { format, data } or null for a body labelled JSON that doesn't parse.
 * With no body (GET, often DELETE) the query parameters are the payload.
 */
function parsePayload(raw, contentType = '', query = {}) {
  const type = contentType.toLowerCase();
  if (raw.trim() === '') return { format: 'query', data: { ...query } };
  if (type.includes('application/x-www-form-urlencoded')) {
    return { format: 'form', data: Object.fromEntries(new URLSearchParams(raw)) };
  }
  const looksJson = /^\s*[{[]/.test(raw);
  if (type.includes('json') || looksJson) {
    try {
      return { format: 'json', data: JSON.parse(raw) };
    } catch {
      return type.includes('json') ? null : { format: 'text', data: raw };
    }
  }
  return { format: 'text', data: raw };
}

/**
 * Flow adds no event name. These examples assume an illustrative body with an
 * `event` field you add on the action, e.g.
 *   {"event": "form.submitted", "name": "...", "email": "..."}
 */
function handlePayload(method, { format, data }) {
  if (format === 'text' || !data || typeof data !== 'object') {
    console.log(`Zoho Flow ${method} with a ${format} body`);
    return;
  }
  switch (data.event) {
    case 'form.submitted':
      console.log(`Form submitted by ${data.email}`);
      // Create the user or lead in your system
      break;
    case 'deal.won':
      console.log(`Deal ${data.deal_id} won`);
      // Start provisioning or invoicing
      break;
    default:
      console.log(`Zoho Flow ${method} with event ${data.event}`);
  }
}

function handler(req, res) {
  if (!process.env.ZOHO_FLOW_WEBHOOK_SECRET) {
    console.error('ZOHO_FLOW_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Authenticate before parsing anything.
  if (!verifyZohoFlowRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const payload = parsePayload(raw, req.get('content-type') || '', req.query);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  try {
    handlePayload(req.method, payload);
  } catch (err) {
    console.error('Error handling Zoho Flow webhook:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // A JSON response: with Response Type JSON or Auto, its keys become variables
  // for later steps in the flow.
  return res.status(200).json({ received: true });
}

// express.raw() reads any content type as bytes; the header is checked first.
const raw = express.raw({ type: '*/*' });
app
  .route('/webhooks/zoho-flow')
  .get(raw, handler)
  .post(raw, handler)
  .put(raw, handler)
  .patch(raw, handler)
  .delete(raw, handler);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Zoho Flow webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/zoho-flow`);
  });
}

module.exports = { app, verifyZohoFlowRequest, parsePayload };
