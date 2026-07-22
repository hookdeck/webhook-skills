// Generated with: whatsapp-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a WhatsApp (Meta) webhook signature.
 *
 * Meta signs the raw request body with HMAC-SHA256 keyed on your app secret and
 * sends the lowercase hex digest in `X-Hub-Signature-256` as `sha256=<hex>`.
 *
 * @param {Buffer} rawBody - Raw request body (must NOT be parsed/re-serialized)
 * @param {string} signatureHeader - X-Hub-Signature-256 header value
 * @param {string} appSecret - Meta app secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyWhatsAppSignature(rawBody, signatureHeader, appSecret) {
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; returns false on length mismatch instead of throwing.
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Dispatch a verified WhatsApp payload.
 *
 * Events are wrapped as { object, entry: [{ id, changes: [{ value, field }] }] }.
 * The `field` names the subscription; inbound messages arrive in value.messages[]
 * and outbound status updates in value.statuses[], both under the `messages` field.
 */
function handleWhatsAppEvent(payload) {
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const { field, value } = change;

      if (field === 'messages') {
        for (const message of value.messages || []) {
          // Inbound message from a user.
          console.log(`Message ${message.id} from ${message.from} (${message.type})`);
          switch (message.type) {
            case 'text':
              console.log(`  Text: ${message.text.body}`);
              // TODO: reply, route to an agent, etc.
              break;
            case 'image':
            case 'audio':
            case 'video':
            case 'document':
            case 'sticker':
              console.log(`  Media id: ${message[message.type].id}`);
              // TODO: download media via the Cloud API using the media id.
              break;
            case 'interactive':
              console.log(`  Interactive reply:`, message.interactive);
              break;
            case 'button':
              console.log(`  Button: ${message.button.text}`);
              break;
            case 'reaction':
              console.log(`  Reaction: ${message.reaction.emoji}`);
              break;
            case 'location':
              console.log(`  Location:`, message.location);
              break;
            default:
              console.log(`  Unhandled message type: ${message.type}`);
          }
        }

        for (const status of value.statuses || []) {
          // Delivery receipt for a message you sent: sent | delivered | read | failed.
          console.log(`Status ${status.id}: ${status.status} -> ${status.recipient_id}`);
          if (status.status === 'failed') {
            console.error('  Delivery failed:', status.errors);
          }
          // TODO: update your message record's delivery state.
        }
        continue;
      }

      // Other subscription fields (templates, account, phone number quality, etc.)
      switch (field) {
        case 'message_template_status_update':
          console.log('Template status update:', value.event);
          break;
        case 'account_update':
          console.log('Account update:', value.event);
          break;
        case 'phone_number_quality_update':
          console.log('Phone number quality update:', value.event);
          break;
        default:
          console.log(`Unhandled field: ${field}`);
      }
    }
  }
}

// GET — Meta verification handshake. Echo hub.challenge when the verify token matches.
app.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    // Respond 200 with the raw challenge value (plain text, no JSON).
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST — event delivery. Must use the raw body for signature verification.
app.post('/webhooks/whatsapp',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-hub-signature-256'];

    if (!verifyWhatsAppSignature(req.body, signature, process.env.WHATSAPP_APP_SECRET)) {
      console.error('WhatsApp signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    const payload = JSON.parse(req.body.toString('utf8'));

    if (payload.object !== 'whatsapp_business_account') {
      // Acknowledge unknown objects so Meta doesn't retry.
      return res.status(200).send('IGNORED');
    }

    handleWhatsAppEvent(payload);

    // Acknowledge quickly; do heavy work asynchronously.
    res.status(200).send('EVENT_RECEIVED');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyWhatsAppSignature, handleWhatsAppEvent };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/whatsapp`);
  });
}
