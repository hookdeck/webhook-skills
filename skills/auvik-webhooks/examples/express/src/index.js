// Generated with: auvik-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

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
 * Auvik does not sign payloads. With Header authentication it sends the custom
 * header (Key and Value) you configured. Node lowercases header names, so the
 * lookup is case-insensitive. The WHOLE value is compared: no "Bearer " parsing.
 * This authenticates the sender only; it gives no body integrity or replay protection.
 */
function verifyAuvikRequest(
  headers,
  headerName = process.env.AUVIK_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.AUVIK_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

function handleAlert(payload) {
  const { alertStatusString, alertName, entityName, companyName } = payload;

  switch (alertStatusString) {
    case 'Triggered':
      console.log(`Alert triggered: ${alertName} on ${entityName} (${companyName})`);
      // TODO: open an incident or ticket (payload.alertId, payload.alertDescription, payload.link)
      break;

    case 'Cleared':
      console.log(`Alert cleared: ${alertName} on ${entityName} (${companyName})`);
      // TODO: resolve the matching incident (payload.alertId)
      break;

    default:
      console.log(`Unhandled alert status: ${alertStatusString}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/auvik', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyAuvikRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Auvik webhook header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleAlert(payload);
  } catch (err) {
    console.error('Error handling Auvik alert:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAuvikRequest = verifyAuvikRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/auvik`);
  });
}
