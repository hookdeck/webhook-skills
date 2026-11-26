// Generated with: ashby-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Ashby webhook signature.
 *
 * Ashby signs the RAW request body with HMAC-SHA256 keyed on your per-webhook
 * secret token, hex-encoded, sent in the Ashby-Signature header as "sha256=<hex>".
 *
 * @param {Buffer} rawBody - Raw request body (unparsed bytes)
 * @param {string} signatureHeader - Ashby-Signature header value
 * @param {string} secret - Ashby webhook secret token
 * @returns {boolean} - Whether the signature is valid
 */
function verifyAshbyWebhook(rawBody, signatureHeader, secret) {
  // Header format: "sha256=<hex>"
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) {
    return false;
  }

  // Compute expected signature over the raw body
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; catch length mismatch on malformed input
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// Ashby webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/ashby',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['ashby-signature'];

    // Verify webhook signature first, before parsing
    if (!verifyAshbyWebhook(req.body, signature, process.env.ASHBY_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      // Ashby does not retry a 401, so a wrong secret drops deliveries. Alert on
      // this log line. If this happens on the ping sent when the webhook is
      // created or edited, Ashby saves the webhook disabled. See
      // references/verification.md.
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification.
    // Every Ashby payload is { action: "<eventName>", data: {...} }.
    const payload = JSON.parse(req.body.toString());
    const { action, data } = payload;

    console.log(`Received Ashby event: ${action}`);

    // Dispatch on the action (event name), NOT on a header.
    switch (action) {
      case 'ping':
        console.log('Ping received — endpoint is reachable');
        break;

      case 'applicationSubmit':
        console.log('Application submitted:', data?.application?.id);
        // Your code: Sync candidate, notify recruiters, etc.
        break;

      case 'applicationUpdate':
        console.log('Application updated:', data?.application?.id);
        // Your code: Keep external systems in sync.
        break;

      case 'candidateHire':
        console.log('Candidate hired, application:', data?.application?.id);
        // Your code: Trigger onboarding, HRIS provisioning, etc.
        // Note: candidateHire also fans out applicationUpdate + candidateStageChange.
        break;

      case 'candidateStageChange':
        console.log('Candidate stage changed, application:', data?.application?.id);
        // Your code: Pipeline analytics, Slack alerts, etc.
        break;

      case 'interviewScheduleCreate':
        console.log('Interview schedule created:', data?.interviewSchedule?.id);
        // Your code: Calendar sync, interviewer prep, etc.
        break;

      case 'offerCreate':
        console.log('Offer created:', data?.offer?.id);
        // Your code: Offer tracking, approvals, etc.
        break;

      default:
        console.log(`Unhandled event: ${action}`);
    }

    // Return 200 to acknowledge receipt. Ashby retries non-2xx responses except 401, 403, 404, 405 and 410.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyAshbyWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ashby`);
  });
}
