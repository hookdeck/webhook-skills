// Generated with: bridge-xyz-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

// The per-endpoint RSA public key (PEM) from the Bridge webhook API response.
// Stored single-line with \n escapes in .env; convert back to real newlines.
const PUBLIC_KEY = (process.env.BRIDGE_WEBHOOK_PUBLIC_KEY || '').replace(/\\n/g, '\n');

// Reject events whose signature timestamp is older than this (replay protection).
const TOLERANCE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Verify a Bridge `X-Webhook-Signature` header.
 *
 * Header format: `t=<timestamp_ms>,v0=<base64_signature>`
 * Bridge signs with RSA-SHA256 over the SHA256 digest of `"<timestamp>.<rawBody>"`.
 * Note: the digest is fed into an RSA-SHA256 verifier, which hashes it a SECOND
 * time — this matches Bridge's reference implementation exactly.
 *
 * @param {Buffer|string} rawBody - the raw (unparsed) request body
 * @param {string} header - the X-Webhook-Signature header value
 * @param {string} publicKeyPem - the endpoint's RSA public key (PEM)
 * @returns {boolean}
 */
function verifyBridgeSignature(rawBody, header, publicKeyPem, toleranceMs = TOLERANCE_MS) {
  if (!header || !publicKeyPem) return false;

  // Parse "t=<ms>,v0=<base64>" — split each pair on the FIRST '=' only, because
  // the base64 signature can contain '=' padding.
  const parts = {};
  for (const pair of header.split(',')) {
    const i = pair.indexOf('=');
    if (i === -1) continue;
    parts[pair.slice(0, i)] = pair.slice(i + 1);
  }
  const timestamp = parts.t;
  const signature = parts.v0;
  if (!timestamp || !signature) return false;

  // Replay protection: reject stale events.
  if (Date.now() - Number(timestamp) > toleranceMs) return false;

  // SHA256 digest of "<timestamp>.<rawBody>". createVerify('sha256') then hashes
  // this digest AGAIN as part of the RSA-SHA256 verification.
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const digest = crypto.createHash('sha256').update(`${timestamp}.${bodyStr}`).digest();

  const verifier = crypto.createVerify('sha256');
  verifier.update(digest);
  verifier.end();

  try {
    return verifier.verify(publicKeyPem, signature, 'base64');
  } catch {
    return false; // malformed key or signature
  }
}

// Bridge webhook endpoint — MUST use the raw body for signature verification.
app.post('/webhooks/bridge-xyz', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];

  if (!signature) {
    return res.status(400).send('Missing X-Webhook-Signature header');
  }

  // req.body is a Buffer of the raw request body (from express.raw).
  if (!verifyBridgeSignature(req.body, signature, PUBLIC_KEY)) {
    // Return non-2xx so Bridge retries delivery.
    return res.status(400).send('Invalid signature');
  }

  // Signature is valid — safe to parse.
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Events are named "<category>.<action>", e.g. "customer.updated.status_transitioned".
  const eventType = event.event_type || event.type;

  switch (eventType) {
    case 'customer.created':
      console.log('Customer created:', event.event_object_id);
      // Your code: provision the account, begin onboarding
      break;

    case 'customer.updated.status_transitioned':
      console.log('Customer status changed:', event.event_object_id);
      // Your code: react to KYC approval/rejection, update customer state
      break;

    case 'kyc_link.updated.status_transitioned':
      console.log('KYC link status changed:', event.event_object_id);
      // Your code: track KYC/ToS completion, unblock onboarding
      break;

    case 'transfer.created':
      console.log('Transfer created:', event.event_object_id);
      // Your code: record the new transfer in your ledger
      break;

    case 'transfer.updated.status_transitioned':
      console.log('Transfer status changed:', event.event_object_id);
      // Your code: update payment status, trigger fulfillment on settlement
      break;

    case 'virtual_account.activity.created':
      console.log('Virtual account activity:', event.event_object_id);
      // Your code: reconcile incoming funds, credit a balance
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Acknowledge receipt quickly.
  res.status(200).json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app (and helper) for testing
module.exports = app;
module.exports.verifyBridgeSignature = verifyBridgeSignature;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bridge-xyz`);
  });
}
