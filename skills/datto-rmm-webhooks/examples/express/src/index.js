// Generated with: datto-rmm-webhooks skill
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
 * Datto RMM does not sign payloads. Authenticate with the secret header you added to the
 * Global Webhook (Add Header). The name is user-chosen, so it comes from
 * DATTO_RMM_WEBHOOK_HEADER; the WHOLE header value (including any "Bearer " prefix you
 * typed) is compared with DATTO_RMM_WEBHOOK_SECRET. A static credential authenticates the
 * sender, not the body, and gives no replay protection.
 */
function verifyDattoRmmRequest(headers, {
  headerName = process.env.DATTO_RMM_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.DATTO_RMM_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

/**
 * The body is the user's template: JSON, text/plain or form-urlencoded. Never rejects.
 */
function parseBody(raw, contentType = '') {
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // not JSON: fall through to plain text
  }
  return { text: raw };
}

// ILLUSTRATIVE: Datto RMM adds no event field. This assumes your alert raised / alert
// resolved templates include a "status" field of "raised" or "resolved".
function handleAlert(payload) {
  const { status, alert_uid: alertUid, alert_message: message } = payload;

  switch (status) {
    case 'raised':
      console.log(`Alert raised ${alertUid}: ${message}`);
      // TODO: open a ticket or page on-call (payload.device_hostname, payload.site_name)
      break;

    case 'resolved':
      console.log(`Alert resolved ${alertUid}: ${message}`);
      // TODO: close the matching ticket
      break;

    default:
      console.log('Unhandled Datto RMM payload (no recognised status field)');
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/datto-rmm', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyDattoRmmRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing secret header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const payload = parseBody(raw, req.headers['content-type'] || '');

  try {
    handleAlert(payload);
  } catch (err) {
    console.error('Error handling Datto RMM webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDattoRmmRequest = verifyDattoRmmRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/datto-rmm`);
  });
}
