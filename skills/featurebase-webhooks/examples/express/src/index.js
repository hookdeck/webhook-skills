// Generated with: featurebase-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// ---------------------------------------------------------------------------
// Featurebase signs every delivery with two headers:
//   X-Webhook-Signature  lowercase hex HMAC-SHA256 (64 chars, no prefix)
//   X-Webhook-Timestamp  Unix seconds when Featurebase sent the request
// Signed content: `${X-Webhook-Timestamp}.${raw body}`, built as bytes.
// Key: the whole signing secret as UTF-8, including its `whsec_` prefix.
// This is NOT Standard Webhooks: nothing is base64-decoded and there is no id
// header, so the standardwebhooks and svix libraries do not apply.
// ---------------------------------------------------------------------------
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verifyFeaturebaseWebhook(rawBody, signature, timestamp, secret, toleranceSeconds = 0) {
  if (!secret || !signature || !timestamp) return { valid: false, error: 'Missing signature, timestamp or secret' };
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_SHA256.test(signature)) return { valid: false, error: 'Malformed signature' };

  // Header values are encoded latin1, exactly as received (never trimmed or parsed).
  const signedContent = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signedContent).digest();
  const provided = Buffer.from(signature.toLowerCase(), 'hex'); // hex is case-insensitive
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in only. Hookdeck retries and replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return { valid: false, error: 'Malformed timestamp' };
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }
  return { valid: true };
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Featurebase retries up to 3 times; the event `id` (notif_...) is the same each time.
const processedEventIds = new Set();

function handleEvent(event) {
  const item = (event.data && event.data.item) || {};

  switch (event.topic) {
    case 'post.created':
      console.log(`Request created: ${item.title} (${item.id})`);
      break;
    case 'post.updated': {
      const changes = event.data && event.data.changes;
      const fields = (Array.isArray(changes) ? changes : []).map((c) => c && c.field);
      console.log(`Request updated: ${item.id}, changed: ${fields.join(', ') || 'n/a'}`);
      break;
    }
    case 'post.voted':
      console.log(`Request ${item.postId} vote ${item.action} by ${item.voter && item.voter.name}`);
      break;
    case 'ticket.created':
      console.log(`Ticket created: #${item.ticketNumber} ${item.title}`);
      break;
    case 'comment.created':
      console.log(`Comment created: ${item.id} on ${item.postId || item.changelogId}`);
      break;
    case 'changelog.published':
      console.log(`Update published: ${item.title} (${item.locale})`);
      break;
    case 'conversation.user.created':
      console.log(`Conversation started: ${item.id} ${item.title}`);
      break;
    case 'conversation.admin.assigned':
      console.log(`Conversation assigned: ${item.id}`);
      break;
    case 'conversation.admin.closed':
      console.log(`Conversation closed: ${item.id}`);
      break;
    default:
      // post.deleted, ticket.updated, comment.updated, conversation.* and the rest.
      console.log(`Unhandled Featurebase topic: ${event.topic}`);
  }
}

// express.raw with '*/*' keeps the exact bytes whatever the content type is.
app.post('/webhooks/featurebase', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.FEATUREBASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FEATUREBASE_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const tolerance = Number(process.env.FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS) || 0;
  const result = verifyFeaturebaseWebhook(
    rawBody,
    req.get('x-webhook-signature'),
    req.get('x-webhook-timestamp'),
    secret,
    tolerance
  );
  if (!result.valid) {
    console.error(`Featurebase signature verification failed: ${result.error}`);
    return res.status(401).json({ error: result.error });
  }

  // Parse only after the signature check.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  if (event.id && processedEventIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }
  if (event.id) processedEventIds.add(event.id);

  handleEvent(event);
  // Featurebase needs 200/201/202/204 within 5 seconds. Queue slow work.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Featurebase webhook server listening on http://localhost:${port}`);
    console.log(`Webhook endpoint: POST http://localhost:${port}/webhooks/featurebase`);
  });
}

module.exports = { app, verifyFeaturebaseWebhook };
