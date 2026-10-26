// Generated with: celcoin-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Celcoin's docs don't name the HTTP method, so accept all the usual ones.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Strict base64 decode: only the base64 alphabet, correct padding, and the value
 * must re-encode to the same string, so "valid credentials followed by junk" fails.
 */
function decodeStrictBase64(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const buf = Buffer.from(value, 'base64');
  if (buf.toString('base64') !== value) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

/**
 * Celcoin does not sign payloads. When the subscription is registered with
 * auth.type "basic", every notification carries
 * `Authorization: Basic base64(login:pwd)`. Check it on every request.
 */
function verifyCelcoinAuth(
  authorization,
  username = process.env.CELCOIN_WEBHOOK_USERNAME,
  password = process.env.CELCOIN_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  if (typeof authorization !== 'string') return false;

  const match = /^basic[ \t]+(\S+)$/i.exec(authorization.trim());
  if (!match) return false;

  const decoded = decodeStrictBase64(match[1]);
  if (decoded === null) return false;

  const sep = decoded.indexOf(':'); // split on the FIRST colon; the password may contain ':'
  if (sep === -1) return false;

  // Evaluate both comparisons so a wrong username takes as long as a wrong password.
  const userOk = safeEqual(decoded.slice(0, sep), username);
  const passOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passOk;
}

function handleEvent(payload) {
  // Envelope: { entity, createTimestamp, status: CONFIRMED | ERROR, body, error? }
  const { entity, status, body } = payload;

  switch (entity) {
    case 'pix-payment-out':
      console.log(`Pix payment out ${status}`, body?.id);
      // TODO: mark the Pix transfer as settled (CONFIRMED) or failed (ERROR)
      break;

    case 'pix-payment-in':
      console.log(`Pix payment in ${status}`, body?.id);
      // TODO: credit the customer for the received Pix
      break;

    case 'pix-reversal-out':
      console.log(`Pix reversal out ${status}`, body?.id);
      // TODO: record the refund you issued
      break;

    case 'pix-reversal-in':
      console.log(`Pix reversal in ${status}`, body?.id);
      // TODO: reconcile the refund received for a Pix-out
      break;

    case 'internal-transfer-in':
      console.log(`Internal transfer in ${status}`, body?.id);
      // TODO: credit the receiving account
      break;

    case 'internal-transfer-out':
      console.log(`Internal transfer out ${status}`, body?.id);
      // TODO: confirm the debit
      break;

    case 'spb-transfer-out':
      console.log(`TED out ${status}`, body?.id);
      // TODO: confirm the TED (on ERROR see payload.error)
      break;

    case 'spb-transfer-in':
      console.log(`TED in ${status}`, body?.id);
      // TODO: credit the received TED
      break;

    case 'onboarding-create':
      console.log(`Onboarding account created ${status}`);
      // TODO: store the new account details
      break;

    case 'onboarding-proposal':
      console.log(`Onboarding proposal result ${status}`);
      // TODO: continue or stop the onboarding journey (proposal Approved or Reproved)
      break;

    case 'kyc':
      console.log(`KYC result ${status}`);
      // TODO: update the account's compliance state
      break;

    default:
      console.log(`Unhandled Celcoin entity: ${entity}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/celcoin', express.raw({ type: '*/*' }), (req, res) => {
  if (!process.env.CELCOIN_WEBHOOK_USERNAME || !process.env.CELCOIN_WEBHOOK_PASSWORD) {
    console.error('Set CELCOIN_WEBHOOK_USERNAME and CELCOIN_WEBHOOK_PASSWORD');
    return res.status(500).json({ error: 'Webhook authentication not configured' });
  }

  // Credential first, for every method. Hookdeck never sends a 401 challenge, so the
  // Authorization header must be present on each request.
  if (!verifyCelcoinAuth(req.headers.authorization)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // GET and DELETE (and some PUT/PATCH) carry no body: acknowledge them.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
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
    console.error('Error handling Celcoin event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCelcoinAuth = verifyCelcoinAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/celcoin`);
  });
}
