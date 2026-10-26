// Generated with: grist-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Grist does not sign payloads. The credential is the webhook's "Header Authorization"
 * field, a static string sent verbatim as the Authorization header. GRIST_AUTHORIZATION is
 * the whole value as typed in Grist (e.g. "Bearer <token>"): compare the complete header,
 * never strip or decode the scheme prefix.
 *
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifyGristRequest(headers, config = process.env) {
  const expected = config.GRIST_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Grist payloads have no event field: the event types (add, update) are set in the
 * webhook's config, and the body is a JSON array of row objects (id plus column values).
 * Rows arrive batched, and Grist retries until success, so keep this idempotent.
 */
function handleRows(rows) {
  for (const row of rows) {
    console.log(`Grist row ${row.id} received`);
    // TODO: upsert the row into your system, keyed on row.id
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Grist uses.
app.post('/webhooks/grist', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyGristRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let rows;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    rows = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const isRow = (r) => r && typeof r === 'object' && !Array.isArray(r);
  if (!Array.isArray(rows) || !rows.every(isRow)) {
    return res.status(400).json({ error: 'Expected a JSON array of row objects' });
  }

  try {
    handleRows(rows);
  } catch (err) {
    console.error('Error handling Grist webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true, rows: rows.length });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyGristRequest = verifyGristRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/grist`);
  });
}
