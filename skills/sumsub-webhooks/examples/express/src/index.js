// Generated with: sumsub-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Sumsub announces the HMAC algorithm per webhook in x-payload-digest-alg.
// SHA256 is the default for new webhooks; older webhooks still send SHA1.
const DIGEST_ALGORITHMS = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

/**
 * Verify a Sumsub webhook digest
 * @param {Buffer} rawBody - Raw request body, exactly as received
 * @param {string|undefined} digest - x-payload-digest header (hex)
 * @param {string|undefined} digestAlg - x-payload-digest-alg header
 * @param {string} secret - The webhook's secret key
 * @returns {boolean} - Whether the digest is valid
 */
function verifySumsubWebhook(rawBody, digest, digestAlg, secret) {
  if (!digest || !secret) {
    return false;
  }

  // Pick the hash from the alg header; an absent header means SHA256, an unknown value is rejected
  const algorithm = DIGEST_ALGORITHMS[digestAlg || 'HMAC_SHA256_HEX'];
  if (!algorithm) {
    return false;
  }

  // HMAC of the raw body bytes, hex-encoded
  const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest('hex');

  // Timing-safe comparison (throws on length mismatch, so treat that as invalid)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Sumsub webhook endpoint - must use the raw body for digest verification
app.post('/webhooks/sumsub',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.SUMSUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error('SUMSUB_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    const digest = req.headers['x-payload-digest'];
    const digestAlg = req.headers['x-payload-digest-alg'];

    if (!digest) {
      return res.status(400).send('Missing x-payload-digest header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Return 400 (not 401): Sumsub treats 401/403/404 as permanent and stops retrying
    if (!verifySumsubWebhook(rawBody, digest, digestAlg, secret)) {
      console.error('Sumsub webhook digest verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const { type, applicantId, externalUserId, reviewStatus } = payload;

    // testMode is only present (true) on deliveries sent with "Test webhook" in the Webhook manager
    if (payload.testMode) {
      console.log('Test webhook from the Webhook manager');
    }

    console.log(`Received ${type} for applicant ${applicantId} (externalUserId: ${externalUserId}, sandbox: ${Boolean(payload.sandboxMode)})`);

    // Route on the body's type field (Sumsub sends no event-type header)
    switch (type) {
      case 'applicantCreated':
        console.log('Applicant created, review status:', reviewStatus);
        // TODO: Link applicantId to your user record
        break;

      case 'applicantPending':
        console.log('Applicant submitted documents, review pending');
        // TODO: Show "verification in progress" to the user
        break;

      case 'applicantReviewed': {
        // reviewAnswer is GREEN (approved) or RED (rejected)
        const answer = payload.reviewResult?.reviewAnswer;
        if (answer === 'GREEN') {
          console.log('Applicant approved');
          // TODO: Unlock verified features
        } else if (answer === 'RED') {
          // RETRY = user can resubmit, FINAL = permanently rejected
          console.log('Applicant rejected:', payload.reviewResult?.reviewRejectType);
          // TODO: Ask for resubmission or block the account
        }
        break;
      }

      case 'applicantOnHold':
        console.log('Applicant on hold, manual review required');
        // TODO: Flag for compliance team
        break;

      case 'applicantActionPending':
        console.log('Applicant action pending:', payload.applicantActionId);
        break;

      case 'applicantActionReviewed':
        console.log('Applicant action reviewed:', payload.applicantActionId, payload.reviewResult?.reviewAnswer);
        // TODO: Apply the action result (e.g. payment method check)
        break;

      case 'applicantReset':
        console.log('Applicant reset');
        // TODO: Clear cached verification state
        break;

      case 'applicantDeleted':
        console.log('Applicant deleted');
        // TODO: Remove local references to the applicant
        break;

      default:
        console.log(`Unhandled event type: ${type}`);
    }

    // Acknowledge quickly: Sumsub expects a response within 10 seconds
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifySumsubWebhook, DIGEST_ALGORITHMS };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sumsub`);
  });
}
