// Generated with: clickpost-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const SCHEME = 'token ';

/** Constant-time compare: hash both sides so the buffers are equal length. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * ClickPost does not sign payloads. With Simple Token authentication it sends
 * `Authorization: Token <secret>`. The scheme is "Token" (not "Bearer") and is
 * matched case-insensitively. The secret is stored bare; if the configured value
 * itself starts with "Token ", strip it. The secret is never trimmed or altered.
 */
function verifyClickPostRequest(headers, configured = process.env.CLICKPOST_WEBHOOK_SECRET) {
  if (!configured) return false; // never accept when unconfigured
  const secret = configured.toLowerCase().startsWith(SCHEME)
    ? configured.slice(SCHEME.length)
    : configured;
  const header = headers['authorization'];
  if (!header || header.slice(0, SCHEME.length).toLowerCase() !== SCHEME) return false;
  return safeEqual(header.slice(SCHEME.length), secret);
}

// Scans can be redelivered or arrive out of order: dedupe on waybill + scan.
// In-memory for the demo; use a database or cache with a TTL in production.
const seen = new Set();
function scanKey(p) {
  return `${p.waybill}:${p.clickpost_status_code}:${p.timestamp}`;
}

function handleScan(payload) {
  const { waybill, clickpost_status_code: code, clickpost_status_description: desc, status, location } = payload;

  switch (code) {
    case 1:
      console.log(`Order placed: ${waybill}`);
      break;
    case 2:
      console.log(`Pickup pending: ${waybill}`);
      break;
    case 4:
      console.log(`Picked up: ${waybill}`);
      break;
    case 5:
      console.log(`In transit: ${waybill} at ${location}`);
      break;
    case 6:
      console.log(`Out for delivery: ${waybill}`);
      // TODO: notify the customer
      break;
    case 8:
      console.log(`Delivered: ${waybill}`);
      // TODO: mark the order delivered
      break;
    case 9:
      console.log(`Failed delivery: ${waybill} (${status})`);
      // TODO: start the NDR / reattempt flow
      break;
    case 41:
    case 42:
    case 43:
    case 44:
      console.log(`Rider update ${code} (${desc}): ${waybill}`);
      break;
    case 47:
    case 48:
    case 50:
    case 52:
      console.log(`Partial delivery / RTO update ${code} (${desc}): ${waybill}`);
      break;
    default:
      console.log(`Unhandled clickpost_status_code ${code} (${desc}): ${waybill}`);
  }
}

// Read the body raw (any content type) and authenticate before parsing it.
app.post('/webhooks/clickpost', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyClickPostRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization: Token header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Number.isInteger(payload.clickpost_status_code)) {
    return res.status(400).json({ error: 'Expected a ClickPost scan object' });
  }

  const key = scanKey(payload);
  if (seen.has(key)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleScan(payload);
  } catch (err) {
    console.error('Error handling ClickPost scan:', err);
    return res.status(500).json({ error: 'Handler error' });
  }
  seen.add(key);

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyClickPostRequest = verifyClickPostRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/clickpost`);
  });
}
