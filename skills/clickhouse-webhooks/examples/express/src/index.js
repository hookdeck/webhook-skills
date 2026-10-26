// Generated with: clickhouse-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Hash both sides so timingSafeEqual always gets equal-length buffers.
const digest = (v) => crypto.createHash('sha256').update(String(v)).digest();

/**
 * ClickStack Generic alert webhooks are not signed. Authentication is a secret header
 * you added under "Webhook headers". The header name is user-chosen, so it comes from
 * CLICKHOUSE_WEBHOOK_HEADER (default Authorization); the expected value is the exact,
 * whole header value in CLICKHOUSE_WEBHOOK_SECRET (any "Bearer " prefix included, not parsed).
 *
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifyClickHouseRequest(headers, env = process.env) {
  const secret = env.CLICKHOUSE_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const name = (env.CLICKHOUSE_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name]; // Node lowercases header names
  return Boolean(received) && crypto.timingSafeEqual(digest(received), digest(secret));
}

// The body is a template you write. Illustrative: {"title":"{{title}}","body":"{{body}}","link":"{{link}}"}
// Anything that isn't a JSON object is handled as plain text.
function parseAlert(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return { body: raw };
}

function handleAlert(alert) {
  const { title, body, link } = alert;
  console.log(`ClickStack alert: ${title ?? '(no title)'} - ${body ?? ''} ${link ?? ''}`.trim());
  // TODO: page on-call, open a ticket, or post to chat. Alerts can repeat on every evaluation.
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/clickhouse', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyClickHouseRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  try {
    handleAlert(parseAlert(raw));
  } catch (err) {
    console.error('Error handling ClickStack alert:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyClickHouseRequest = verifyClickHouseRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/clickhouse`);
  });
}
