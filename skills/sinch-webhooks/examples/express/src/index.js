// Generated with: sinch-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Standard padded base64 of a 32-byte digest: 43 characters + "="
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify Sinch Conversation API callback headers.
 * x-sinch-webhook-signature is base64(HMAC-SHA256(secret, body + "." + nonce + "." + timestamp)),
 * where nonce and timestamp come from x-sinch-webhook-signature-nonce / -timestamp.
 * The secret is the webhook's `secret`, used as UTF-8 bytes as-is.
 *
 * Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
 * original timestamp, so a window is off unless toleranceSeconds > 0.
 */
function verifySinchSignature(rawBody, { signature, nonce, timestamp }, secret, toleranceSeconds = 0) {
  if (!signature || !nonce || !timestamp || !secret) return false;
  if (!BASE64_SHA256.test(signature)) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  // Build the signed message as bytes: body "." nonce "." timestamp (never a re-encoded body string)
  const signedData = Buffer.concat([
    rawBody,
    Buffer.from('.', 'utf8'),
    Buffer.from(nonce, 'latin1'),
    Buffer.from('.', 'utf8'),
    Buffer.from(timestamp, 'latin1'),
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedData).digest('base64');

  // Format validated above, so both buffers are 44 bytes; compare in constant time
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
}

// Sinch callbacks have no type field: exactly one callback-specific top-level key is present
const CALLBACK_KEYS = [
  'message',
  'message_delivery_report',
  'event',
  'event_delivery_report',
  'message_submit_notification',
  'conversation_start_notification',
  'conversation_stop_notification',
  'contact_create_notification',
  'contact_delete_notification',
  'contact_update_notification',
  'contact_merge_notification',
  'opt_in_notification',
  'opt_out_notification',
  'capability_notification',
  'batch_status_update_notification',
  'duplicated_contact_identities_notification',
  'unsupported_callback',
];

// Sinch Conversation API callback endpoint - must use the raw body
app.post('/webhooks/sinch',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const tolerance = Number(process.env.SINCH_WEBHOOK_TOLERANCE_SECONDS) || 0;

    if (!verifySinchSignature(
      rawBody,
      {
        signature: req.get('x-sinch-webhook-signature'),
        nonce: req.get('x-sinch-webhook-signature-nonce'),
        timestamp: req.get('x-sinch-webhook-signature-timestamp'),
      },
      process.env.SINCH_WEBHOOK_SECRET,
      tolerance
    )) {
      console.error('Sinch webhook verification failed');
      return res.sendStatus(401);
    }

    // Parse only after the signature check
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON payload');
    }

    const callbackKey = CALLBACK_KEYS.find(
      (key) => payload && payload[key] !== null && typeof payload[key] === 'object'
    );

    switch (callbackKey) {
      case 'message':
        console.log('Inbound message:', payload.message.id, payload.message.channel_identity?.channel);
        // TODO: Process the contact's message (payload.message.contact_message)
        break;

      case 'message_delivery_report':
        console.log('Delivery report:', payload.message_delivery_report.message_id, payload.message_delivery_report.status);
        // TODO: Update the delivery status of the message
        break;

      case 'contact_create_notification':
        console.log('Contact created:', payload.contact_create_notification.contact?.id);
        // TODO: Sync the new contact
        break;

      case undefined:
        console.log('Unrecognised callback, keys:', Object.keys(payload || {}));
        break;

      default:
        console.log(`Received ${callbackKey} callback`);
    }

    res.sendStatus(200);
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sinch`);
  });
}
