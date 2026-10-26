// Generated with: emarsys-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/** SHA-256 of a Buffer or string: equal-length digests make timingSafeEqual safe to call. */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest();
}

/** Constant-time comparison of two Buffers/strings of any length. */
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Parse "Authorization: Basic base64(username:password)".
 * - scheme is case-insensitive
 * - only the strict base64 alphabet is accepted, with canonical padding, so valid
 *   credentials followed by junk are rejected
 * - split on the FIRST colon (the password may contain colons)
 * Returns { username: Buffer, password: Buffer } or null.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!match || match[1].length % 4 !== 0) return null;
  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.toString('base64') !== match[1]) return null; // non-canonical encoding
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * SAP Emarsys does not sign Webhook node calls. The sender authenticates with HTTP Basic auth
 * (a static shared credential), so this proves who sent the request, not that the body is
 * untampered, and it gives no replay protection.
 */
function verifyEmarsysRequest(
  headers,
  username = process.env.EMARSYS_WEBHOOK_USERNAME,
  password = process.env.EMARSYS_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const credentials = parseBasicAuth(headers.authorization);
  if (!credentials) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(credentials.username, username);
  const passOk = safeEqual(credentials.password, password);
  return userOk && passOk;
}

// Demo only: use a durable store (database, Redis) in production.
const seenDeduplicationIds = new Set();

/**
 * The body is whatever the Webhook node preset defines, so this payload is ILLUSTRATIVE:
 * contact field values and "Additional data" at the top level, optional event_data with the
 * triggering event's attributes, and operational fields (deduplication_id, ems_program_id,
 * event_time) that can be renamed in the preset.
 */
function handlePayload(payload) {
  const { event_data: eventData, ems_program_id: programId, event_time: eventTime } = payload;

  if (eventData && typeof eventData === 'object') {
    console.log(`Webhook node call with event_data (program ${programId}, at ${eventTime})`);
    // TODO: act on the triggering event's attributes in payload.event_data
  } else {
    console.log(`Webhook node contact payload (program ${programId}, at ${eventTime})`);
    // TODO: act on the contact field values and Additional data at the top level
  }
}

// Read the body raw (any content type) and authenticate before parsing it.
app.post('/webhooks/emarsys', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyEmarsysRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  // 406 tells Emarsys to discard this contact and keep the program running. Any other
  // failure is retried (30 s growing to 10 min) and the program enters Fail-safe mode
  // after the 11th failure, so use 406 for bodies that can never be processed.
  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(406).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(406).json({ error: 'Expected a JSON object' });
  }

  // Idempotency: deduplication_id (when present) identifies a delivery.
  const dedupId = payload.deduplication_id;
  if (dedupId !== undefined && seenDeduplicationIds.has(String(dedupId))) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handlePayload(payload);
  } catch (err) {
    console.error('Error handling Emarsys webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (dedupId !== undefined) seenDeduplicationIds.add(String(dedupId));
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyEmarsysRequest = verifyEmarsysRequest;
module.exports.parseBasicAuth = parseBasicAuth;
module.exports.seenDeduplicationIds = seenDeduplicationIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/emarsys`);
  });
}
