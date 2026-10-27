require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Standard padded base64 of a 32-byte digest: 43 characters plus "="
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify an Onshape webhook signature.
 *
 * Onshape sends X-onshape-webhook-signature-primary =
 * base64(HMAC-SHA256(key, "<X-onshape-webhook-timestamp value>.<raw body>")).
 * The key is the company's primary signature key, used as a UTF-8 string.
 *
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string|undefined} timestamp - X-onshape-webhook-timestamp header value, as received
 * @param {string|undefined} signature - X-onshape-webhook-signature-primary header value
 * @param {string|undefined} secret - Primary signature key
 * @returns {boolean} - Whether the signature is valid
 */
function verifyOnshapeSignature(rawBody, timestamp, signature, secret) {
  if (!timestamp || !signature || !secret) {
    return false;
  }
  // Validate the format before comparing: exact length and alphabet
  if (!SIGNATURE_FORMAT.test(signature)) {
    return false;
  }

  // Signed message as bytes: header (latin1) + "." + raw body bytes
  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(message).digest('base64');

  const received = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}

/**
 * Optional replay window. Off unless toleranceSeconds > 0. Accepts epoch
 * seconds, epoch milliseconds or a date string; anything unparsable fails.
 */
function isTimestampFresh(timestamp, toleranceSeconds, now = Date.now()) {
  if (!toleranceSeconds || toleranceSeconds <= 0) {
    return true;
  }
  let sentAt;
  if (/^\d+(\.\d+)?$/.test(timestamp)) {
    const n = Number(timestamp);
    sentAt = n < 1e11 ? n * 1000 : n;
  } else {
    sentAt = Date.parse(timestamp);
  }
  if (Number.isNaN(sentAt)) {
    return false;
  }
  return Math.abs(now - sentAt) <= toleranceSeconds * 1000;
}

/**
 * Handle a verified Onshape event, dispatching on the body's `event` field.
 */
function handleOnshapeEvent(event) {
  switch (event.event) {
    case 'webhook.register':
    case 'webhook.ping':
    case 'webhook.unregister':
      // Sent automatically when a webhook is registered, pinged or removed.
      // Returning 200 is all that is needed.
      console.log(`Onshape ${event.event} for webhook ${event.webhookId}`);
      break;

    case 'onshape.model.lifecycle.changed':
      console.log(`Model changed in document ${event.documentId} (element ${event.elementId})`);
      // TODO: Refresh your copy of the model / re-run exports
      break;

    case 'onshape.model.translation.complete':
      console.log(`Translation ${event.translationId} complete in document ${event.documentId}`);
      // TODO: Download the translated file
      break;

    case 'onshape.document.lifecycle.created':
      console.log(`Document created: ${event.documentId}`);
      // TODO: Register the document in your system
      break;

    case 'onshape.document.lifecycle.statechange':
      console.log(`Document ${event.documentId} state: ${event.documentState}`);
      // TODO: Archive or remove data when the state is TRASH or DELETED
      break;

    case 'onshape.revision.created':
      console.log(`Revision created in document ${event.documentId}`);
      // TODO: Sync the release / revision
      break;

    case 'onshape.comment.create':
      console.log(`Comment ${event.commentId} created in document ${event.documentId}`);
      // TODO: Fetch the comment via the REST API and notify
      break;

    case 'onshape.user.lifecycle.updateappsettings':
      console.log(`App settings updated for user ${event.userId} (client ${event.clientId})`);
      // TODO: Re-read the user's app settings
      break;

    default:
      console.log(`Unhandled Onshape event: ${event.event}`);
  }
}

// Onshape webhook endpoint - raw body for signature verification, any content type
app.post('/webhooks/onshape',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.ONSHAPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('ONSHAPE_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-onshape-webhook-signature-primary'];
    const timestamp = req.headers['x-onshape-webhook-timestamp'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Only the primary signature is verified; the -secondary header is ignored
    if (!verifyOnshapeSignature(rawBody, timestamp, signature, secret)) {
      console.error('Onshape webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    const tolerance = Number(process.env.ONSHAPE_WEBHOOK_TOLERANCE_SECONDS) || 0;
    if (!isTimestampFresh(timestamp, tolerance)) {
      return res.status(401).send('Timestamp outside tolerance');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (event === null || typeof event !== 'object') {
      return res.status(400).send('Invalid payload');
    }

    // Retries resend the same event: de-duplicate on event.messageId
    handleOnshapeEvent(event);

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyOnshapeSignature, isTimestampFresh };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/onshape`);
  });
}
