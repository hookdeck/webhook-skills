// Generated with: breezy-hr-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Breezy HR webhook signature.
 * X-Hook-Signature is the bare hex HMAC-SHA256 of the raw body. The key is the
 * whole whsec_ secret as a UTF-8 string (not Standard Webhooks: no prefix
 * stripping, no base64 decoding).
 * @param {Buffer} rawBody - Raw request body
 * @param {string|undefined} signature - X-Hook-Signature header value
 * @param {string} secret - Endpoint secret (whsec_...)
 * @returns {boolean}
 */
function verifyBreezySignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const received = Buffer.from(signature.trim().toLowerCase());
  const computed = Buffer.from(expected);

  // timingSafeEqual throws when lengths differ, so check first
  return received.length === computed.length && crypto.timingSafeEqual(received, computed);
}

// Raw body is required: the signature covers the exact bytes Breezy sent.
// '*/*' makes the body a Buffer whatever Content-Type arrives.
app.post('/webhooks/breezy-hr',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-hook-signature'];

    if (!signature) {
      return res.status(400).send('Missing X-Hook-Signature header');
    }

    if (!Buffer.isBuffer(req.body) || !verifyBreezySignature(req.body, signature, process.env.BREEZY_HR_WEBHOOK_SECRET)) {
      console.error('Breezy HR signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Envelope: { _id, type, object, creation_date }. Deduplicate on _id.
    const { _id: eventId, type, object } = event;
    console.log(`Received ${type} event (${eventId})`);

    switch (type) {
      case 'candidateAdded':
        console.log('Candidate added:', object?.candidate?.name, 'to', object?.position?.name);
        // TODO: Sync the candidate, notify the hiring team, etc.
        break;

      case 'candidateStatusUpdated':
        console.log(
          'Candidate moved:', object?.candidate?.name,
          `${object?.stage_was?.name} -> ${object?.stage?.name}`
        );
        // TODO: Trigger interview scheduling, background checks, etc.
        break;

      case 'candidateDeleted':
        console.log('Candidate deleted:', object?.candidate?._id);
        // TODO: Remove candidate data from downstream systems
        break;

      case 'companyPositionAdded':
        console.log('Position added:', object?.position?.name);
        break;

      case 'companyPositionUpdated':
        console.log('Position updated:', object?.position?.name);
        break;

      case 'companyPositionDeleted':
        console.log('Position deleted:', object?.position?._id);
        break;

      case 'companyPositionStateUpdated':
        console.log('Position state changed:', `${object?.state_was} -> ${object?.state_is}`);
        break;

      case 'companyNotePosted':
      case 'companyNoteUpdated':
      case 'companyNoteDeleted':
        console.log(`Team note event ${type}:`, object?.note_id);
        break;

      default:
        console.log('Unhandled event type:', type);
    }

    // Any 2xx tells Breezy the delivery succeeded
    res.status(200).json({ received: true });
  }
);

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Breezy HR webhook server listening on http://localhost:${port}`);
    console.log(`Webhook endpoint: POST http://localhost:${port}/webhooks/breezy-hr`);
  });
}

module.exports = { app, verifyBreezySignature };
