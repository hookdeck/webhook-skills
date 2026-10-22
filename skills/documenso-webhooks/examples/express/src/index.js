// Generated with: documenso-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Documenso does not sign the payload. It sends the webhook secret you configured as
 * plain text in the X-Documenso-Secret header (an empty string when no secret is set).
 * Reject an unconfigured secret and an empty header, then compare in constant time.
 */
function verifyDocumensoSecret(receivedSecret, expectedSecret = process.env.DOCUMENSO_WEBHOOK_SECRET) {
  if (!expectedSecret) return false; // never accept requests when no secret is configured
  if (!receivedSecret) return false; // empty header = webhook created without a secret
  return safeEqual(receivedSecret, expectedSecret);
}

function handleEvent(body) {
  const { event, payload = {} } = body;

  switch (event) {
    case 'DOCUMENT_CREATED':
      console.log(`Document created: ${payload.title} (${payload.envelopeId})`);
      break;

    case 'DOCUMENT_SENT':
      console.log(`Document sent: ${payload.title}`);
      break;

    case 'DOCUMENT_OPENED':
      console.log(`Document opened: ${payload.title}`);
      break;

    case 'DOCUMENT_SIGNED':
      console.log(`Document signed: ${payload.title}`);
      // TODO: update the signer's status in your database
      break;

    case 'DOCUMENT_RECIPIENT_COMPLETED':
      console.log(`Recipient completed: ${payload.title}`);
      break;

    case 'DOCUMENT_COMPLETED':
      console.log(`Document completed: ${payload.title}`);
      // TODO: fetch the signed PDF and archive it
      break;

    case 'DOCUMENT_REJECTED':
      console.log(`Document rejected: ${payload.title}`);
      // TODO: notify the document owner
      break;

    case 'DOCUMENT_CANCELLED':
      console.log(`Document cancelled: ${payload.title}`);
      break;

    case 'DOCUMENT_REMINDER_SENT':
      console.log(`Reminder sent: ${payload.title}`);
      break;

    case 'RECIPIENT_EXPIRED':
      console.log(`Recipient signing deadline passed: ${payload.title}`);
      break;

    case 'TEMPLATE_CREATED':
    case 'TEMPLATE_UPDATED':
    case 'TEMPLATE_DELETED':
    case 'TEMPLATE_USED':
      console.log(`Template event ${event}: ${payload.title}`);
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the secret check happens before parsing.
app.post('/webhooks/documenso', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyDocumensoSecret(req.headers['x-documenso-secret'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    body = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(body);
  } catch (err) {
    console.error('Error handling Documenso event:', err);
    // A non-2xx makes Documenso retry the delivery.
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDocumensoSecret = verifyDocumensoSecret;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/documenso`);
  });
}
