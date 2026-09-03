// Generated with: alchemy-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Alchemy Notify webhook signature.
 *
 * Alchemy signs the RAW request body with HMAC-SHA256 (hex) using the
 * per-webhook signing key and sends it in the `X-Alchemy-Signature` header.
 * There is no `sha256=` prefix and no timestamp.
 *
 * @param {Buffer|string} rawBody - Raw request body (never re-stringified JSON)
 * @param {string} signature - X-Alchemy-Signature header value (bare hex digest)
 * @param {string} signingKey - Per-webhook signing key
 * @returns {boolean} Whether the signature is valid
 */
function verifyAlchemySignature(rawBody, signature, signingKey) {
  if (!signature) {
    return false;
  }

  const digest = crypto
    .createHmac('sha256', signingKey)
    .update(rawBody, 'utf8')
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false; // different lengths = invalid
  }
}

// Alchemy webhook endpoint - must use the raw body for signature verification
app.post(
  '/webhooks/alchemy',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-alchemy-signature'];

    // Verify the signature before trusting anything in the payload
    if (!verifyAlchemySignature(req.body, signature, process.env.ALCHEMY_SIGNING_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification succeeds
    const payload = JSON.parse(req.body.toString('utf8'));
    const { type, id, webhookId, event } = payload;

    console.log(`Received ${type} event (id: ${id}, webhook: ${webhookId})`);

    // Dispatch on the webhook type
    switch (type) {
      case 'ADDRESS_ACTIVITY':
        for (const activity of event?.activity ?? []) {
          console.log(
            `Address activity on ${event.network}: ${activity.value} ${activity.asset} ` +
              `${activity.fromAddress} -> ${activity.toAddress} (${activity.hash})`
          );
        }
        // TODO: credit balances, detect deposits, update accounting, etc.
        break;

      // DEPRECATED 2026-08-30: no longer documented by Alchemy and not accepted by the
      // Notify API's create-webhook endpoint. Kept so webhooks created before that date
      // keep working; don't wire new integrations to it.
      case 'MINED_TRANSACTION':
        console.log(`Mined tx on ${event?.network}: ${event?.transaction?.hash}`);
        // TODO: confirm sends, advance order status, unlock features, etc.
        break;

      // DEPRECATED 2026-08-30: see MINED_TRANSACTION above.
      case 'DROPPED_TRANSACTION':
        console.log(`Dropped tx on ${event?.network}: ${event?.transaction?.hash}`);
        // TODO: resubmit with higher gas, alert the user, roll back UI, etc.
        break;

      case 'NFT_ACTIVITY':
        for (const activity of event?.activity ?? []) {
          console.log(
            `NFT activity on ${event.network}: contract ${activity.contractAddress} ` +
              `token ${activity.erc721TokenId ?? activity.tokenId} ` +
              `${activity.fromAddress} -> ${activity.toAddress}`
          );
        }
        // TODO: update marketplace feed, track ownership, mint alerts, etc.
        break;

      // DEPRECATED 2026-08-30: see MINED_TRANSACTION above.
      case 'NFT_METADATA_UPDATE':
        console.log(
          `NFT metadata update on ${event?.network}: ` +
            `${event?.contractAddress} #${event?.tokenId}`
        );
        // TODO: refresh cached media/attributes, re-index the collection, etc.
        break;

      case 'GRAPHQL':
        console.log('Custom Webhook (GraphQL) matched:', JSON.stringify(event?.data ?? {}));
        // TODO: handle your Custom Webhook query results
        break;

      default:
        console.log(`Unhandled webhook type: ${type}`);
    }

    // Acknowledge receipt quickly; do heavy work asynchronously
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyAlchemySignature };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/alchemy`);
  });
}
