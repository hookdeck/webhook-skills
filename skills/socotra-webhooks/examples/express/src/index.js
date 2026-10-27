// Generated with: socotra-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * SOCOTRA WEBHOOK VERIFICATION
 *
 *   header    : socotra-signature: t=<unix ms>,v1=<hex>[,v1=<hex>...]
 *   algorithm : HMAC-SHA256, lowercase hex
 *   signed    : the t value exactly as sent (a string), ".", then the RAW body bytes
 *   key       : the endpoint `secret`, used as UTF-8 bytes
 *   tag       : leave the endpoint's `tag` unset. A tagged endpoint signs
 *               `{t}.{body}.{tag}`, which this check (and Hookdeck) cannot verify.
 */
const SIGNATURE_HEX = /^[0-9a-fA-F]{64}$/;

/**
 * Split `t=...,v1=...,v1=...` into the timestamp string and every v1 value.
 * Other keys (v0, tag, ...) are ignored.
 */
function parseSignatureHeader(header) {
  let timestamp;
  const signatures = [];
  for (const part of String(header || '').split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && timestamp === undefined) timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  return { timestamp, signatures };
}

/**
 * Verify a Socotra webhook. Returns true only when ANY v1= entry equals
 * HMAC-SHA256(secret, `${t}.` + rawBody).
 *
 * @param {Buffer} rawBody unparsed request body (empty Buffer when there is none)
 * @param {string|undefined} header the socotra-signature header
 * @param {string} secret the endpoint secret
 * @param {number} [toleranceSeconds] optional max age of t in seconds; 0/undefined = off
 */
function verifySocotraSignature(rawBody, header, secret, toleranceSeconds = 0) {
  if (!header || !secret) return false;

  const { timestamp, signatures } = parseSignatureHeader(header);
  if (!timestamp || signatures.length === 0) return false;

  // Signed message as bytes: the t string as sent + "." + the raw body.
  const signedMessage = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedMessage).digest();

  let valid = false;
  for (const signature of signatures) {
    // Validate length and alphabet BEFORE decoding: Buffer.from(x, 'hex') silently drops bad characters.
    if (!SIGNATURE_HEX.test(signature)) continue;
    const received = Buffer.from(signature.toLowerCase(), 'hex');
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) {
      valid = true;
    }
  }
  if (!valid) return false;

  // Opt-in replay window. t is Unix MILLISECONDS.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() - Number(timestamp)) > toleranceSeconds * 1000) return false;
  }
  return true;
}

function toleranceSeconds() {
  const value = Number(process.env.SOCOTRA_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Webhooks deliver an EventResponse: { locator, requestId, userLocator, timestamp, type, data }.
// Dispatch on `type`; the full list is on Socotra's Event Definitions page.
function handleEvent(event) {
  switch (event.type) {
    case 'policy.account.create':
      console.log(`Account created: ${event.locator}`);
      break;
    case 'policy.quote.accept':
      console.log(`Quote accepted: ${event.locator}`);
      break;
    case 'policy.quote.issue':
      console.log(`Quote issued: ${event.locator}`);
      break;
    case 'billing.invoice.generate':
      console.log(`Invoice generated: ${event.locator}`);
      break;
    case 'billing.payment.create':
      console.log(`Payment created: ${event.locator}`);
      break;
    case 'document.ready':
      console.log(`Document ready: ${event.locator}`);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// Socotra's docs don't name the HTTP method, so accept the usual ones.
// The raw body is required: re-serialising parsed JSON changes the bytes.
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const rawBody = express.raw({ type: '*/*' });

function socotraWebhook(req, res) {
  // A request with no body (e.g. GET) leaves req.body unset: verify over zero bytes.
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifySocotraSignature(body, req.get('socotra-signature'), process.env.SOCOTRA_WEBHOOK_SECRET, toleranceSeconds())) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Verified. Nothing to parse for an empty body, so acknowledge it.
  if (body.length === 0) {
    return res.status(200).json({ received: true });
  }

  let event;
  try {
    event = JSON.parse(body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  handleEvent(event);
  return res.status(200).json({ received: true });
}

for (const method of METHODS) {
  app[method]('/webhooks/socotra', rawBody, socotraWebhook);
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Socotra webhook endpoint: http://localhost:${PORT}/webhooks/socotra`);
  });
}

module.exports = { app, verifySocotraSignature, parseSignatureHeader, handleEvent };
