// Generated with: facebook-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Facebook webhook signature.
 *
 * Meta signs the RAW request body with HMAC-SHA256 keyed on your App Secret and
 * sends the digest in X-Hub-Signature-256 as `sha256=<hex>`. Verify over the raw
 * bytes BEFORE parsing JSON — Meta signs an escaped-unicode form of the payload,
 * so a re-serialized JSON string will not match.
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Hub-Signature-256 header value
 * @param {string} appSecret - Facebook App Secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyFacebookSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader) {
    return false;
  }

  // Header format: sha256=<hex>
  const [algo, signature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guard against length mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Dispatch a single entry from the webhook payload.
 * A POST can batch up to 1000 updates, so handle each entry individually.
 */
function handleEntry(object, entry) {
  // Messenger deliveries carry a `messaging` array instead of `changes`.
  if (Array.isArray(entry.messaging)) {
    for (const event of entry.messaging) {
      console.log(`Messenger message from ${event.sender?.id}:`, event.message?.text);
      // TODO: Route to your chatbot / support system.
    }
    return;
  }

  for (const change of entry.changes || []) {
    switch (`${object}:${change.field}`) {
      case 'page:feed':
        console.log('Page feed change:', change.value?.item, change.value?.verb);
        // TODO: Moderate comments, sync posts, reply, etc.
        break;

      case 'page:mention':
        console.log('Page mentioned:', change.value?.post_id);
        // TODO: Social listening / alerts.
        break;

      case 'page:messages':
        console.log('Page message field change:', change.value);
        // TODO: Handle Messenger message field updates.
        break;

      case 'instagram:comments':
        console.log('Instagram comment:', change.value?.id);
        // TODO: Comment moderation / auto-reply.
        break;

      case 'instagram:mentions':
        console.log('Instagram mention:', change.value?.media_id);
        // TODO: Engagement tracking.
        break;

      case 'user:feed':
        console.log('User feed update:', change.value?.verb);
        // TODO: Personal timeline sync.
        break;

      default:
        console.log(`Unhandled (object, field): (${object}, ${change.field})`);
    }
  }
}

// GET verification handshake — Meta sends this when the Callback URL is saved.
app.get('/webhooks/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    // Echo the challenge back verbatim to complete verification.
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Forbidden');
});

// POST event delivery — must use the raw body for signature verification.
app.post('/webhooks/facebook',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-hub-signature-256'];

    if (!verifyFacebookSignature(req.body, signature, process.env.FACEBOOK_APP_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification.
    const payload = JSON.parse(req.body.toString('utf8'));
    const object = payload.object;

    console.log(`Received ${object} webhook with ${payload.entry?.length || 0} entr(y/ies)`);

    for (const entry of payload.entry || []) {
      handleEntry(object, entry);
    }

    // Acknowledge quickly; process heavy work asynchronously.
    res.status(200).send('EVENT_RECEIVED');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyFacebookSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/facebook`);
  });
}
