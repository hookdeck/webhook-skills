// Generated with: veriff-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Veriff webhook signature.
 *
 * Veriff sends X-HMAC-SIGNATURE: lowercase hex HMAC-SHA256 of the RAW request body,
 * keyed with the integration's shared secret key (used as a plain string).
 *
 * @param {Buffer|string} rawBody - Raw request body, exactly as received
 * @param {string} signatureHeader - X-HMAC-SIGNATURE header value
 * @param {string} secret - Integration shared secret key
 * @returns {boolean}
 */
function verifyVeriffSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Veriff documents a lowercase comparison; normalise before the timing-safe compare
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths throw, which means the signature is invalid
  }
}

// Decision webhook: verification.status values
function handleDecision(payload) {
  const verification = payload.verification;
  if (!verification) {
    // Veriff sends verification: null while a decision is not yet available
    console.log('Decision webhook without a verification object');
    return;
  }

  const { id, attemptId, status, reason, vendorData } = verification;
  const ref = `session ${id} (attempt ${attemptId}, vendorData ${vendorData})`;

  switch (status) {
    case 'approved':
      console.log(`Verification approved: ${ref}`);
      // TODO: Mark the end-user as verified
      break;
    case 'declined':
      console.log(`Verification declined: ${ref}, reason: ${reason}`);
      // TODO: Reject the end-user, log reasonCode
      break;
    case 'resubmission_requested':
      console.log(`Resubmission requested: ${ref}, reason: ${reason}`);
      // TODO: Ask the end-user to retry with the same session
      break;
    case 'review':
      console.log(`Verification in review: ${ref}`);
      break;
    case 'expired':
      console.log(`Verification expired: ${ref}`);
      break;
    case 'abandoned':
      console.log(`Verification abandoned: ${ref}`);
      break;
    default:
      console.log(`Unhandled decision status: ${status}`);
  }
}

// Event webhook: action values
function handleEvent(payload) {
  const ref = `session ${payload.id} (attempt ${payload.attemptId})`;

  switch (payload.action) {
    case 'started':
      console.log(`End-user started the flow: ${ref}`);
      break;
    case 'submitted':
      console.log(`End-user submitted the attempt: ${ref}`);
      // TODO: Show a "waiting for decision" state
      break;
    case 'waiting_continued':
    case 'waiting_complete':
    case 'flow_finished':
    case 'flow_cancelled':
    case 'document_type_other_selected':
      console.log(`Flow event ${payload.action}: ${ref}`);
      break;
    default:
      console.log(`Unhandled event action: ${payload.action}`);
  }
}

// Veriff webhook endpoint - raw body is required for signature verification
app.post('/webhooks/veriff',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.VERIFF_SHARED_SECRET;
    if (!secret) {
      console.error('VERIFF_SHARED_SECRET is not set');
      return res.status(500).send('Server configuration error');
    }

    const signature = req.headers['x-hmac-signature'];
    if (!signature) {
      return res.status(400).send('Missing X-HMAC-SIGNATURE header');
    }

    if (!verifyVeriffSignature(req.body, signature, secret)) {
      console.error('Veriff signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after the signature is verified
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Decision webhooks carry a `verification` object; event webhooks carry `action`
    if ('verification' in payload) {
      handleDecision(payload);
    } else if (payload.action) {
      handleEvent(payload);
    } else {
      console.log('Unhandled Veriff webhook type');
    }

    // Veriff expects a 200 within 5 seconds, otherwise it retries for up to a week
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyVeriffSignature };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/veriff`);
  });
}
