// Generated with: nylas-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');

const app = express();

/**
 * Verify a Nylas webhook signature.
 *
 * Nylas signs the RAW request body with HMAC-SHA256 keyed on the
 * per-destination webhook_secret, and sends the hex digest in the
 * `x-nylas-signature` header. Only the body is signed (this is NOT
 * Standard Webhooks — there is no timestamp in the signed content).
 *
 * When Content-Encoding is gzip, the signature covers the COMPRESSED
 * bytes, so `rawBody` here must be the exact bytes received.
 *
 * @param {Buffer} rawBody - Raw request body bytes (still gzipped if compressed)
 * @param {string} signatureHeader - x-nylas-signature header value (hex)
 * @param {string} secret - Nylas webhook_secret
 * @returns {boolean}
 */
function verifyNylasSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; different lengths / non-hex => invalid.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// --- Challenge handshake (endpoint verification) ---------------------------
// When the webhook is created, Nylas GETs this URL with ?challenge=<value>.
// Echo the exact value back as plain text with 200 within 20 seconds.
app.get('/webhooks/nylas', (req, res) => {
  res.status(200).type('text/plain').send(req.query.challenge);
});

// Collect the exact request bytes, untouched. We deliberately avoid
// express.raw()/body-parser here because it inflates (or rejects) gzip bodies
// based on Content-Encoding — but Nylas signs the COMPRESSED bytes, so we must
// verify them before decompressing.
function collectRawBody(req, res, next) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);
    next();
  });
  req.on('error', next);
}

// --- Notification handler --------------------------------------------------
app.post(
  '/webhooks/nylas',
  collectRawBody,
  (req, res) => {
    // Header casing varies; Express lowercases header keys.
    const signature = req.headers['x-nylas-signature'];

    if (!verifyNylasSignature(req.rawBody, signature, process.env.NYLAS_WEBHOOK_SECRET)) {
      console.error('Nylas webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Signature valid — now safe to decompress (if needed) and parse.
    let json;
    try {
      const buf =
        req.headers['content-encoding'] === 'gzip'
          ? zlib.gunzipSync(req.rawBody)
          : req.rawBody;
      json = JSON.parse(buf.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid payload');
    }

    // Nylas payloads follow CloudEvents 1.0: trigger in `type`,
    // resource in `data.object`.
    // `type` can carry suffixes you didn't subscribe to: `.truncated` (body
    // removed, fetch the message by ID) and `.transformed` (customized fields).
    const { id, data } = json;
    const type = String(json.type).replace(/(\.(?:truncated|transformed))+$/, '');
    const object = data?.object;
    // Some types put grant_id in `data`, most in `data.object`.
    const grantId = data?.grant_id ?? object?.grant_id;
    console.log(`Received ${type} (id: ${id}, grant: ${grantId})`);

    switch (type) {
      case 'message.created':
        console.log('New message:', object?.subject);
        // Your code: parse the email, run automation, notify, etc.
        break;

      case 'message.updated':
        console.log('Message updated:', object?.id);
        break;

      case 'message.opened':
        console.log('Tracked message opened:', object?.message_id ?? object?.id);
        // Your code: record open, update engagement analytics
        break;

      case 'message.link_clicked':
        console.log('Tracked link clicked:', object?.id);
        break;

      case 'message.bounce_detected':
        console.log('Message bounced:', object?.id);
        // Your code: add to suppression list, alert deliverability
        break;

      case 'event.created':
        console.log('Calendar event created:', object?.title ?? object?.id);
        // Your code: sync booking, update availability
        break;

      case 'event.updated':
        console.log('Calendar event updated:', object?.id);
        break;

      case 'event.deleted':
        console.log('Calendar event deleted:', object?.id);
        break;

      case 'grant.created':
        console.log('Grant created (account connected):', grantId);
        // Your code: provision user, kick off initial sync
        break;

      case 'grant.expired':
        console.log('Grant expired — re-auth required:', grantId);
        // Your code: prompt the user to reconnect their account
        break;

      case 'grant.deleted':
        console.log('Grant deleted (account disconnected):', grantId);
        // Your code: deprovision, clean up
        break;

      default:
        console.log(`Unhandled trigger: ${type}`);
    }

    // Acknowledge quickly. Do heavy work asynchronously.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyNylasSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/nylas`);
  });
}
