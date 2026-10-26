// Generated with: invoice-ninja-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Invoice Ninja sends the webhook with the subscription's rest_method, which its server
// validates as post (the default) or put.
const ALLOWED_METHODS = ['POST', 'PUT'];

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
 * Invoice Ninja does not sign payloads. You add a secret header (key/value) to the
 * webhook; the header name is yours, so it comes from configuration. The WHOLE value
 * is compared, including any "Bearer " prefix you typed: nothing is stripped or parsed.
 * Node lower-cases header names, which makes the lookup case-insensitive.
 */
function verifyInvoiceNinjaRequest(
  headers,
  secret = process.env.INVOICE_NINJA_WEBHOOK_SECRET,
  headerName = process.env.INVOICE_NINJA_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}

/**
 * The body is the entity itself (transformer output) and has NO event field. The
 * event key (create_invoice, ...) only names the subscription, so route by URL
 * (add ?event=create_invoice to the target URL) or fall back to the entity's shape.
 */
function detectEntity(payload) {
  if (Array.isArray(payload.line_items)) return 'document'; // invoice, quote, credit, purchase order
  if ('applied' in payload || 'transaction_reference' in payload) return 'payment';
  if (Array.isArray(payload.contacts)) return 'client';
  return 'unknown';
}

function handleEntity(event, payload) {
  const entity = event ? null : detectEntity(payload);

  if (event === 'create_invoice') {
    console.log(`Invoice created: ${payload.number} (${payload.id})`);
    // TODO: sync the new invoice (payload.amount, payload.client_id, payload.line_items)
  } else if (event === 'create_payment') {
    console.log(`Payment created: ${payload.number} (${payload.id})`);
    // TODO: record the payment (payload.amount, payload.client_id, payload.invoices)
  } else if (event === 'update_client') {
    console.log(`Client updated: ${payload.name} (${payload.id})`);
    // TODO: refresh the client record (payload.contacts)
  } else if (event) {
    console.log(`Unhandled event: ${event}`);
  } else if (entity === 'document') {
    console.log(`Document received: ${payload.number} (${payload.id})`);
  } else if (entity === 'payment') {
    console.log(`Payment received: ${payload.number} (${payload.id})`);
  } else if (entity === 'client') {
    console.log(`Client received: ${payload.name} (${payload.id})`);
  } else {
    console.log('Unrecognised entity shape');
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
// Never answer 404, 405 or 410: Invoice Ninja deletes the webhook subscription when it sees them.
app.all('/webhooks/invoice-ninja', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyInvoiceNinjaRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    return res.status(400).json({ error: `Unsupported method ${req.method}` });
  }

  // Invoice Ninja always sends a JSON body; an empty one is still acknowledged.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = {};
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Expected a JSON object' });
    }
  }

  try {
    handleEntity(typeof req.query.event === 'string' ? req.query.event : null, payload);
  } catch (err) {
    console.error('Error handling Invoice Ninja webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyInvoiceNinjaRequest = verifyInvoiceNinjaRequest;
module.exports.detectEntity = detectEntity;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST|PUT http://localhost:${PORT}/webhooks/invoice-ninja`);
  });
}
