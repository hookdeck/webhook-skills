// Generated with: honeycomb-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Honeycomb's docs don't name the HTTP method, so accept all the usual ones.
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

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
 * Honeycomb does not sign payloads. It sends the webhook's Shared Secret as plain text
 * in the X-Honeycomb-Webhook-Token header. This authenticates the sender only: it does not
 * cover the body and gives no replay protection. Compare the WHOLE header value.
 */
function verifyHoneycombRequest(headers, secret = process.env.HONEYCOMB_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers['x-honeycomb-webhook-token']; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

const KINDS = ['trigger', 'budget_rate', 'exhaustion_time', 'anomaly'];

/**
 * Honeycomb sends no event-type field or header, and doesn't document the standard payload
 * field by field. Enable a custom payload template for each alert type and put a constant
 * "kind" field in each one (see SKILL.md). Anything else is classed as unknown.
 */
function classifyAlert(payload) {
  return KINDS.includes(payload.kind) ? payload.kind : 'unknown';
}

function handleAlert(kind, payload) {
  switch (kind) {
    case 'trigger':
      console.log(`Trigger alert: ${payload.status} ${payload.summary || ''}`);
      // Page on-call or open an incident here.
      break;

    case 'budget_rate':
    case 'exhaustion_time':
      console.log(`SLO burn alert (${kind}): ${payload.status} ${payload.summary || ''}`);
      // Escalate before the error budget runs out here.
      break;

    case 'anomaly':
      console.log(`Anomaly Detection alert: ${payload.status} ${payload.summary || ''}`);
      // Open an investigation here.
      break;

    default:
      console.log(`Unrecognised Honeycomb payload (keys: ${Object.keys(payload).join(', ')})`);
  }
}

// Delivery IDs already handled. In-memory for the example: use a shared store (Redis, DB) in production.
const seenDeliveries = new Set();

// Read the body raw (any content type) so the request is authenticated before parsing.
function handler(req, res) {
  // Check the credential first, for every method.
  if (!verifyHoneycombRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing X-Honeycomb-Webhook-Token' });
  }

  // The delivery ID is stable across retries of the same delivery.
  const deliveryId = req.headers['x-honeycomb-webhook-delivery-id'];
  if (deliveryId && seenDeliveries.has(deliveryId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = null;
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
    if (payload) handleAlert(classifyAlert(payload), payload);
  } catch (err) {
    console.error('Error handling Honeycomb alert:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (deliveryId) seenDeliveries.add(deliveryId);
  res.status(200).json({ received: true });
}

for (const method of METHODS) {
  app[method]('/webhooks/honeycomb', express.raw({ type: '*/*' }), handler);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHoneycombRequest = verifyHoneycombRequest;
module.exports.classifyAlert = classifyAlert;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/honeycomb`);
  });
}
