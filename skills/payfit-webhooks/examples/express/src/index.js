// Generated with: payfit-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// PayFit delivers webhooks through Svix (its event catalogue is a Svix-hosted
// page for PayFit's Svix organization). Each request carries:
//   svix-id         unique message ID: dedupe on it
//   svix-timestamp  seconds since epoch
//   svix-signature  space-separated "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: the endpoint's signing secret (whsec_...) with the prefix removed,
// base64-DECODED.
// ---------------------------------------------------------------------------

/**
 * The signing secret is "whsec_" + base64. The HMAC key is the decoded bytes
 * of the part after the prefix, not the string. Node's base64 decoder skips
 * characters it doesn't know, so insist on canonical base64.
 * @param {string|undefined} secret
 * @returns {Buffer|null}
 */
function decodeSigningSecret(secret) {
  const value = String(secret || '').trim().replace(/^whsec_/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length === 0) return null;
  if (key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null;
  return key;
}

/**
 * Verify a PayFit (Svix) delivery.
 * @param {Buffer|string} rawBody - the exact bytes PayFit sent
 * @param {{ 'svix-id'?: string, 'svix-timestamp'?: string, 'svix-signature'?: string }} headers
 * @param {string|undefined} secret - PAYFIT_WEBHOOK_SECRET (whsec_...)
 * @param {number|null} toleranceSeconds - optional freshness window; null = off.
 *   Svix's guide says to check svix-timestamp against your clock. A delivery
 *   replayed later (from a queue, or Svix's "Recover Failed") keeps its
 *   original timestamp, so a window rejects it. Dedupe on svix-id either way.
 * @param {number} nowSeconds
 * @returns {boolean}
 */
function verifyPayfitWebhook(rawBody, headers, secret, toleranceSeconds = null, nowSeconds = Date.now() / 1000) {
  const key = decodeSigningSecret(secret);
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatures = headers['svix-signature'];
  if (!key || !id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (toleranceSeconds !== null && Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;

  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();
  // Space-separated "v1,<base64>" entries: during a secret rotation there is
  // one per secret. Any v1 match passes.
  return signatures
    .trim()
    .split(/\s+/)
    .some((entry) => {
      const [version, signature] = entry.split(',');
      if (version !== 'v1' || !signature) return false;
      const given = Buffer.from(signature, 'base64');
      return given.length === expected.length && crypto.timingSafeEqual(given, expected);
    });
}

/**
 * Every body is { type, data }. data.companyId identifies the PayFit company;
 * effectiveDate is when it happened.
 */
function handleEvent(event) {
  const data = event.data || {};
  switch (event.type) {
    case 'integration.activated':
      console.log(`Company ${data.companyId} activated your integration`);
      break;
    case 'integration.deactivated':
      console.log(`Company ${data.companyId} deactivated your integration`);
      break;
    case 'payroll.run':
      // payrollMonth is YYYYMM. Fetch the payroll data from the PayFit API.
      console.log(`Company ${data.companyId} ran payroll for ${data.payrollMonth}`);
      break;
    default:
      console.log(`Unhandled PayFit event: ${event.type}`);
  }
  return { received: true, type: event.type, company_id: data.companyId || null };
}

function toleranceFromEnv() {
  const value = process.env.PAYFIT_WEBHOOK_TOLERANCE_SECONDS;
  return value ? Number(value) : null;
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/payfit', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.PAYFIT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PAYFIT_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (!decodeSigningSecret(secret)) {
    console.error('PAYFIT_WEBHOOK_SECRET is not a valid whsec_ base64 secret: check the value you configured');
    return res.status(500).json({ error: 'Webhook secret is not valid base64' });
  }

  const headers = {
    'svix-id': req.get('svix-id'),
    'svix-timestamp': req.get('svix-timestamp'),
    'svix-signature': req.get('svix-signature'),
  };
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyPayfitWebhook(rawBody, headers, secret, toleranceFromEnv())) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  return res.status(200).json(handleEvent(event));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PayFit webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/payfit`);
  });
}

module.exports = { app, decodeSigningSecret, verifyPayfitWebhook, handleEvent };
