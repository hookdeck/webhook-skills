// Generated with: missive-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const PREFIX = 'sha256=';

/**
 * Verify Missive's X-Hook-Signature: "sha256=" + hex HMAC-SHA256 of the raw
 * body, keyed with the rule's validation secret (UTF-8). No timestamp.
 */
function verifyMissiveSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !header.startsWith(PREFIX)) return false;
  const sig = header.slice(PREFIX.length);
  // Validate before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}

/**
 * Handle a verified Missive rule webhook.
 *
 * Missive has no event header: dispatch on payload.rule.type. The docs' payload
 * example is label_change; other rule types are chosen in the rule UI.
 */
function handleRule(payload) {
  const type = payload.rule?.type;
  const conversation = payload.conversation ?? {};

  switch (type) {
    case 'label_change':
      console.log(`Label change on "${conversation.subject}" (${conversation.id})`);
      console.log(`Shared labels: ${conversation.shared_label_names || '(none)'}`);
      // TODO: Notify a channel, create a task, sync labels to your CRM, etc.
      break;
    case undefined:
      // Verified body without a rule (for example the validation request sent on save)
      console.log('Missive request without rule.type acknowledged');
      break;
    default:
      console.log(`Unhandled Missive rule type: ${type} (rule ${payload.rule.id})`);
  }

  if (payload.latest_message) {
    console.log(`Latest message (${payload.latest_message.type}): ${payload.latest_message.subject ?? payload.latest_message.preview}`);
  }
  // Missive retries failed deliveries: deduplicate on rule.id + conversation.id + message id.
}

// Missive webhook endpoint - must use the raw body for signature verification.
// type: '*/*' keeps req.body a Buffer whatever content type is sent.
app.post('/webhooks/missive',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.MISSIVE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('MISSIVE_WEBHOOK_SECRET is not set');
      return res.status(500).send('Server configuration error');
    }

    const signature = req.headers['x-hook-signature'];
    if (!Buffer.isBuffer(req.body) || !verifyMissiveSignature(req.body, signature, secret)) {
      return res.status(401).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).send('Invalid payload');
    }

    try {
      handleRule(payload);
    } catch (err) {
      console.error('Error handling Missive webhook:', err);
      return res.status(500).send('Internal error');
    }

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyMissiveSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/missive`);
  });
}
