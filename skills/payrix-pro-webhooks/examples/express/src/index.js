// Generated with: payrix-pro-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Payrix Pro does not sign requests. It sends whatever Header Name / Header Value you
 * set on the webhook action. Compare the WHOLE header value with the expected value:
 * no prefix is stripped or parsed ("Bearer ..." is just part of the value).
 */
function verifyPayrixProRequest(
  headers,
  secret = process.env.PAYRIX_PRO_WEBHOOK_SECRET,
  headerName = process.env.PAYRIX_PRO_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lower-cases header names
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

/** Parse JSON when the content type says so; otherwise keep the raw text. */
function parseBody(raw, contentType = '') {
  if (!raw) return { payload: null };
  if (/json/i.test(contentType)) {
    try {
      return { payload: JSON.parse(raw) };
    } catch {
      return { error: 'Invalid JSON body' };
    }
  }
  return { payload: raw };
}

function handleAlert(payload) {
  // The payload shape isn't documented; this is an illustrative transaction alert:
  // { "alert": "transaction", "transaction": { "id": "t1_txn_...", "total": 1500 } }
  if (payload && typeof payload === 'object') {
    console.log('Payrix Pro alert (JSON):', JSON.stringify(payload).slice(0, 200));
  } else if (payload) {
    console.log('Payrix Pro alert (raw text):', String(payload).slice(0, 200));
  } else {
    console.log('Payrix Pro alert (empty body)');
  }
  // TODO: dispatch on the fields your alert actually sends
}

// Read the body raw (any content type); the credential is checked before anything is parsed.
function webhookHandler(req, res) {
  if (!verifyPayrixProRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const { payload, error } = parseBody(raw, req.headers['content-type']);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    handleAlert(payload);
  } catch (err) {
    console.error('Error handling Payrix Pro alert:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

// Payrix doesn't document the HTTP method, so accept all of them.
for (const method of METHODS) {
  app[method]('/webhooks/payrix-pro', express.raw({ type: '*/*' }), webhookHandler);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPayrixProRequest = verifyPayrixProRequest;
module.exports.parseBody = parseBody;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/payrix-pro (GET, POST, PUT, PATCH, DELETE)`);
  });
}
