// Generated with: bridge-api-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Bridge API webhook signature.
 *
 * Bridge signs the RAW body with HMAC-SHA256 (key = signing secret) and sends
 * the digest in the `BridgeApi-Signature` header as one or more comma-separated,
 * scheme-prefixed values: `v1=<UPPERCASE_HEX>,v1=<UPPERCASE_HEX>`.
 *
 * - Only the `v1` scheme is trusted (ignore others → prevents downgrade attacks).
 * - Multiple `v1` values can appear during a secret rotation (old secret valid
 *   24h). Accept the delivery if ANY `v1` value matches.
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - BridgeApi-Signature header value
 * @param {string} secret - Bridge webhook signing secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyBridgeWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  // Compute the expected HMAC-SHA256 hex digest over the raw body
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Keep only v1= signatures and strip the scheme prefix
  const signatures = signatureHeader
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1='))
    .map((s) => s.slice(3));

  if (signatures.length === 0) {
    return false;
  }

  // hex decoding is case-insensitive, so Bridge's UPPERCASE hex compares cleanly.
  // timingSafeEqual throws on length mismatch, so guard each comparison.
  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch {
      return false;
    }
  });
}

// Bridge webhook endpoint - must use the raw body for signature verification
app.post(
  '/webhooks/bridge-api',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const signature = req.headers['bridgeapi-signature'];

    // Verify the webhook signature BEFORE parsing the body
    if (!verifyBridgeWebhook(req.body, signature, process.env.BRIDGE_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification succeeds
    const event = JSON.parse(req.body.toString());
    const { type, content } = event;

    console.log(`Received ${type} event`);

    // Dispatch on the event `type` field (there is no event header).
    // Expect webhooks for already-deleted users/items — handle defensively.
    switch (type) {
      case 'TEST_EVENT':
        console.log('Test event received from the Bridge dashboard');
        break;

      case 'item.created':
        console.log(`Item created: ${content?.item_id}`);
        // Your code: track onboarding progress
        break;

      case 'item.refreshed':
        console.log(`Item refreshed: ${content?.item_id} (status_code ${content?.status_code})`);
        // Your code: pull fresh accounts/transactions
        break;

      case 'item.account.created':
        console.log(`Account created under item ${content?.item_id}`);
        // Your code: store the account, start reconciliation
        break;

      case 'item.account.updated':
        console.log(`Account updated under item ${content?.item_id}`);
        // Your code: update cached balances
        break;

      case 'item.account.deleted':
        console.log(`Account deleted under item ${content?.item_id}`);
        // Your code: clean up local records
        break;

      case 'payment.transaction.created':
        console.log('Payment transaction created');
        // Your code: record a pending payment
        break;

      case 'payment.transaction.updated':
        console.log('Payment transaction updated');
        // Your code: reconcile payment status
        break;

      case 'payment.link.updated':
        console.log('Payment link updated');
        // Your code: update checkout/payment-link state
        break;

      case 'user.deleted':
        console.log(`User deleted: ${content?.user_uuid}`);
        // Your code: GDPR cleanup, revoke access
        break;

      default:
        console.log(`Unhandled event type: ${type}`);
    }

    // Acknowledge quickly with a small body (<10 KB). Do heavy work async.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyBridgeWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bridge-api`);
  });
}
