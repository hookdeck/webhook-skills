// Generated with: metabase-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and lengths aren't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Metabase does not sign payloads. With "Basic" authentication it sends
 * `Authorization: Basic base64(username:password)` on every request, up front.
 * A static credential authenticates the sender, not the body, and gives no
 * replay protection: use HTTPS and rotate the credential if it leaks.
 */
function verifyMetabaseRequest(
  headers,
  username = process.env.METABASE_WEBHOOK_USERNAME,
  password = process.env.METABASE_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured

  const header = headers['authorization'];
  if (typeof header !== 'string') return false;

  // Scheme is case-insensitive; the credentials must be strict base64.
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.toString('base64') !== match[1]) return false; // trailing junk / bad padding

  // Split on the first colon only: the password may contain colons.
  const colon = decoded.indexOf(0x3a);
  if (colon === -1) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.subarray(0, colon), Buffer.from(username));
  const passOk = safeEqual(decoded.subarray(colon + 1), Buffer.from(password));
  return userOk && passOk;
}

function handleEvent(payload) {
  switch (payload.type) {
    case 'alert': {
      const { question_id, question_name, question_url, raw_data } = payload.data || {};
      const rows = raw_data && Array.isArray(raw_data.rows) ? raw_data.rows.length : 0;
      const test = payload.alert_id === null ? ' (test alert)' : '';
      console.log(`Alert${test}: ${question_name} (#${question_id}) returned ${rows} rows ${question_url}`);
      // TODO: forward to chat/on-call, store raw_data, or decode payload.data.visualization (base64 PNG)
      break;
    }

    default:
      console.log(`Unhandled event: ${payload.type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before
// parsing. Alerts embed a base64 PNG, so raise the default 100kb body limit.
app.post('/webhooks/metabase', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  if (!verifyMetabaseRequest(req.headers)) {
    res.set('WWW-Authenticate', 'Basic realm="metabase-webhook"');
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
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
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Metabase event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMetabaseRequest = verifyMetabaseRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/metabase`);
  });
}
