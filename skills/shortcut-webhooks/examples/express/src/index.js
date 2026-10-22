require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Shortcut webhook signature.
 * Payload-Signature is the hex HMAC-SHA256 of the raw request body (UTF-8),
 * keyed with the secret string entered when the webhook was created.
 * @param {Buffer} rawBody - Raw request body
 * @param {string|undefined} signatureHeader - Payload-Signature header value
 * @param {string} secret - Shortcut webhook secret
 * @returns {boolean}
 */
function verifyShortcutWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; a length mismatch throws, which means invalid
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Shortcut webhook endpoint. express.raw with '*/*' keeps the raw bytes for
// any content type, which is what the signature is computed over.
app.post('/webhooks/shortcut',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['payload-signature'];

    if (!signature) {
      return res.status(400).send('Missing Payload-Signature header');
    }

    if (!verifyShortcutWebhook(req.body, signature, process.env.SHORTCUT_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    console.log(`Received Shortcut event ${payload.id} (member: ${payload.member_id})`);

    // One event can carry several actions; dispatch on entity_type + action
    for (const item of payload.actions || []) {
      switch (`${item.entity_type} ${item.action}`) {
        case 'story create':
          console.log(`Story created: ${item.name} (${item.id})`);
          // TODO: Post to Slack, create a branch, etc.
          break;

        case 'story update':
          console.log(`Story updated: ${item.name} (${item.id})`, Object.keys(item.changes || {}));
          // TODO: React to workflow_state_id, owner_ids, estimate changes, etc.
          break;

        case 'story delete':
          console.log(`Story deleted: ${item.id}`);
          // TODO: Remove the story from your own records
          break;

        case 'epic update':
          console.log(`Epic updated: ${item.name} (${item.id})`);
          // TODO: Sync epic status, notify stakeholders, etc.
          break;

        case 'story-comment create':
          console.log(`Comment created: ${item.id}`);
          // TODO: Bot replies, command parsing, etc.
          break;

        default:
          console.log(`Unhandled action: ${item.entity_type} ${item.action}`);
      }
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyShortcutWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/shortcut`);
  });
}
