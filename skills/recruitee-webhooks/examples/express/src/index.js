// Generated with: recruitee-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Recruitee webhook signature.
 *
 * Recruitee sends the hex HMAC-SHA256 of the RAW request body, keyed with the
 * webhook secret, in the X-Recruitee-Signature header (no prefix, no timestamp).
 *
 * @param {Buffer} rawBody - Raw request body (unparsed bytes)
 * @param {string} signatureHeader - X-Recruitee-Signature header value
 * @param {string} secret - Recruitee webhook secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyRecruiteeWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Compare the hex strings as UTF-8 bytes. Decoding with Buffer.from(x, 'hex')
  // would stop at the first non-hex character and accept a digest with trailing junk.
  const received = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Recruitee sends {"test":true} on "Verify and create" / "Test"; it only needs a 200.
function isTestRequest(rawBody) {
  try {
    const parsed = JSON.parse(rawBody.toString());
    return parsed && parsed.test === true && parsed.event_type === undefined;
  } catch {
    return false;
  }
}

// Recruitee webhook endpoint. express.raw with '*/*' keeps the raw bytes for any
// content type, which signature verification needs.
app.post('/webhooks/recruitee',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-recruitee-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    // Verify the signature first, before parsing
    if (!verifyRecruiteeWebhook(rawBody, signature, process.env.RECRUITEE_WEBHOOK_SECRET)) {
      // The bare test request may arrive unsigned; it carries no event data.
      if (!signature && isTestRequest(rawBody)) {
        return res.status(200).send('OK');
      }
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Test request (signed): acknowledge without processing.
    if (event.test === true && !event.event_type) {
      return res.status(200).send('OK');
    }

    // The event name is in the body: event_type (+ event_subtype), NOT a header.
    const { id, attempt_count, event_type, event_subtype, payload } = event;
    console.log(`Received Recruitee event: ${event_type}/${event_subtype} (id ${id}, attempt ${attempt_count})`);

    // Retries reuse the same id: dedupe on it in real handlers.
    switch (event_type) {
      case 'new_candidate':
        console.log('New candidate:', payload?.candidate?.id, `(${event_subtype})`);
        // TODO: Notify recruiters, sync to CRM, etc.
        break;

      case 'candidate_assigned':
        console.log('Candidate assigned to offer:', payload?.candidate?.id, payload?.offer?.id);
        // TODO: Track applications per job.
        break;

      case 'candidate_moved':
        // Disqualification arrives here, not as its own event_type.
        if (event_subtype === 'disqualified') {
          console.log('Candidate disqualified:', payload?.candidate?.id, payload?.details?.disqualify_reason?.name);
        } else if (event_subtype === 'requalified') {
          console.log('Candidate requalified:', payload?.candidate?.id);
        } else {
          console.log('Candidate moved:', payload?.candidate?.id, payload?.details?.from_stage?.name, '->', payload?.details?.to_stage?.name);
        }
        // TODO: Pipeline analytics, Slack alerts, onboarding on the hire stage, etc.
        break;

      case 'candidate_deleted':
        console.log('Candidate deleted:', payload?.candidate?.id);
        // TODO: Erase the candidate in downstream systems.
        break;

      case 'offer_published':
        console.log('Job published:', payload?.offer?.id);
        break;

      case 'offer_unpublished':
        console.log('Job unpublished:', payload?.offer?.id);
        break;

      case 'offer_updated':
        console.log('Job updated:', payload?.offer?.id, `(${event_subtype})`);
        break;

      default:
        console.log(`Unhandled event: ${event_type}`);
    }

    // Recruitee treats any status other than 200 as a failure and retries.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyRecruiteeWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/recruitee`);
  });
}
