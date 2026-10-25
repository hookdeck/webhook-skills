// Generated with: threads-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

/**
 * Verify a Threads (Meta) webhook signature.
 *
 * Meta sends X-Hub-Signature-256: sha256=<hex>, the HMAC-SHA256 hex digest of
 * the RAW request body keyed with the app secret. The pattern check guarantees
 * exactly 64 hex characters (so no silent truncation from Buffer.from(x, 'hex')),
 * and both sides are then compared as equal-length lowercase hex strings.
 */
function verifyThreadsSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const match = SIGNATURE_PATTERN.exec(signatureHeader);
  if (!match) {
    return false;
  }

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(match[1].toLowerCase(), 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}

/**
 * Dispatch one notification. Threads sends a flat object:
 * { app_id, topic, target_id, time, subscription_id, values: { field, value } }
 */
function handleNotification(notification) {
  const field = notification.values?.field;
  const value = notification.values?.value || {};

  switch (field) {
    case 'replies':
      console.log(`Reply ${value.id} by @${value.username} to post ${value.replied_to?.id}`);
      // TODO: Moderate or respond to the reply.
      break;

    case 'mentions':
      console.log(`Mention in post ${value.id} by @${value.username}`);
      // TODO: Social listening / alerts.
      break;

    case 'publish':
      console.log(`Post ${value.id} published by @${value.username}`);
      // TODO: Sync published posts.
      break;

    case 'delete':
      console.log(`Post ${value.id} deleted at ${value.deleted_at}`);
      // TODO: Remove the post from your own store.
      break;

    default:
      console.log(`Unhandled Threads field: ${field}`);
  }
}

// Constant-time compare for the GET handshake's hub.verify_token.
function verifyTokenMatches(token, expected) {
  if (typeof token !== 'string' || !token || !expected) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GET verification handshake: Meta sends this when the Callback URL is saved.
app.get('/webhooks/threads', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && verifyTokenMatches(token, process.env.THREADS_VERIFY_TOKEN)) {
    // Echo the challenge back verbatim as plain text.
    return res.status(200).type('text/plain').send(String(challenge));
  }

  return res.status(403).send('Forbidden');
});

// POST event delivery: the raw body is needed for signature verification.
// '*/*' makes sure every content type reaches the verifier as a Buffer.
app.post('/webhooks/threads',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-hub-signature-256'];

    if (!verifyThreadsSignature(req.body, signature, process.env.THREADS_APP_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification.
    let notification;
    try {
      notification = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    console.log(`Received Threads ${notification.topic} notification`);
    handleNotification(notification);

    return res.status(200).send('EVENT_RECEIVED');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyThreadsSignature };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/threads`);
  });
}
