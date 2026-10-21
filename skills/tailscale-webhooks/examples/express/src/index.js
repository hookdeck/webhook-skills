// Generated with: tailscale-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Tailscale webhook signature.
 *
 * Header: `Tailscale-Webhook-Signature: t=<unix seconds>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the webhook secret as a raw string.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string} header - `Tailscale-Webhook-Signature` header value
 * @param {string} secret - Webhook secret (e.g. tskey-webhook-xxxxx)
 * @param {number} toleranceSeconds - Max age of `t` (Tailscale suggests 5 minutes)
 * @param {number} nowSeconds - Current time in seconds (injectable for tests)
 * @returns {boolean} Whether the signature is valid and fresh
 */
function verifyTailscaleWebhook(
  rawBody,
  header,
  secret,
  toleranceSeconds = 300,
  nowSeconds = Date.now() / 1000
) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;

  // Replay protection
  if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest('hex');

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // length mismatch = invalid
    }
  });
}

// Tailscale webhook endpoint - must use the raw body for signature verification.
app.post('/webhooks/tailscale', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['tailscale-webhook-signature'];
  const secret = process.env.TAILSCALE_WEBHOOK_SECRET;

  if (!header) {
    return res.status(400).send('Missing Tailscale-Webhook-Signature header');
  }
  if (!secret) {
    console.error('TAILSCALE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }
  if (!verifyTailscaleWebhook(req.body, header, secret)) {
    console.error('Tailscale webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification. The root of the payload is an array of events.
  let events;
  try {
    events = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!Array.isArray(events)) {
    return res.status(400).send('Expected an array of events');
  }

  for (const event of events) {
    const { type, tailnet, message, data } = event;
    switch (type) {
      case 'nodeCreated':
        console.log(`Node created in ${tailnet}: ${data?.deviceName} (${data?.nodeID})`);
        break;
      case 'nodeNeedsApproval':
        console.log(`Node needs approval: ${data?.deviceName}`);
        break;
      case 'nodeApproved':
        console.log(`Node approved: ${data?.deviceName}`);
        break;
      case 'nodeKeyExpiringInOneDay':
        console.log(`Node key expiring within a day: ${data?.deviceName}`);
        break;
      case 'nodeDeleted':
        console.log(`Node deleted: ${data?.deviceName}`);
        break;
      case 'policyUpdate':
        console.log(`Policy file updated by ${data?.actor}`);
        break;
      case 'userCreated':
        console.log(`User created: ${data?.user ?? message}`);
        break;
      case 'test':
        console.log('Received Tailscale test event');
        break;
      default:
        console.log(`Unhandled event type: ${type}`);
    }
    // TODO: persist / forward. Events have no id: use type + timestamp + data.nodeID
    // as an idempotency key.
  }

  // Always 2XX unless there is a transient failure, otherwise Tailscale retries.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyTailscaleWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tailscale`);
  });
}
