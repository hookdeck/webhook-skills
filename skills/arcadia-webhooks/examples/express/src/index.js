// Generated with: arcadia-webhooks skill
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
 * Arcadia does not sign payloads. Arcadia support adds a custom header (name and
 * value) to every webhook. The name is user-chosen, so it comes from
 * ARCADIA_WEBHOOK_HEADER; the whole header value is compared with
 * ARCADIA_WEBHOOK_SECRET (no "Bearer " parsing). This authenticates the sender,
 * not the body, and gives no replay protection.
 */
function verifyArcadiaRequest(headers, env = process.env) {
  const secret = env.ARCADIA_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const name = (env.ARCADIA_WEBHOOK_HEADER || 'X-Arcadia-Token').toLowerCase();
  const received = headers[name]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

// In-memory de-duplication on the payload id. Use a durable store in production.
const seen = new Set();

function handleEvent(payload) {
  const { eventType, resource } = payload;

  switch (eventType) {
    case 'STATUS_CHANGE':
      console.log(`Status change on ${resource}: ${payload.data?.id}`);
      // TODO: if payload.data.isCustomerActionRequired, prompt the user to fix the connection
      break;

    case 'NEW_DATA_AVAILABLE':
      console.log(`New data available for ${resource}: ${payload.data?.id}`);
      // TODO: fetch the new data for payload.data.accounts
      break;

    case 'EXISTING_DATA_UPDATED':
      console.log(`Existing data updated for ${resource}: ${payload.data?.id}`);
      // TODO: re-sync the affected records
      break;

    case 'DATA_DELETED':
      console.log(`Data deleted (${resource}): ${payload.data?.businessUnitId}`);
      // TODO: remove or move local copies (payload.data.movedToBusinessUnitId)
      break;

    case 'BUSINESS_UNIT_ASSIGNMENT':
      console.log(`Business unit assignment (${resource})`);
      // TODO: update ownership of payload.data.account
      break;

    case 'REAL_TIME_CREDENTIAL_VALIDATION_SUCCESS':
      console.log(`Credential validated: ${payload.data?.id}`);
      // TODO: mark the connection ready
      break;

    case 'REAL_TIME_CREDENTIAL_VALIDATION_FAILURE':
      console.log(`Credential validation failed: ${payload.data?.id}`);
      // TODO: ask the user to re-enter their utility credentials
      break;

    case 'MFA_CHALLENGE_METHOD':
      console.log(`MFA method needed for credential ${payload.data?.credential?.id}`);
      // TODO: show payload.data.verificationMethods and submit the choice
      break;

    case 'MFA_CHALLENGE_CODE':
      console.log(`MFA code needed for credential ${payload.data?.credential?.id}`);
      // TODO: prompt the user for the code
      break;

    default:
      console.log(`Unhandled eventType: ${eventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/arcadia', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyArcadiaRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Arcadia webhook header' });
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

  if (payload.id && seen.has(payload.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Arcadia event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (payload.id) seen.add(payload.id);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyArcadiaRequest = verifyArcadiaRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/arcadia`);
  });
}
