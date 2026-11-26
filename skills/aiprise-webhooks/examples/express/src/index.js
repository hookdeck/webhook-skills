// Generated with: aiprise-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an AiPrise callback signature.
 *
 * AiPrise signs the raw request body with HMAC-SHA256 using your API private key
 * and sends the lowercase hex digest in the X-HMAC-SIGNATURE header. There is no
 * separate webhook secret — the signing key IS the API private key.
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-HMAC-SIGNATURE header value
 * @param {string} apiKey - AiPrise API private key
 * @returns {boolean} Whether the signature is valid
 */
function verifyAiPriseWebhook(rawBody, signatureHeader, apiKey) {
  if (!signatureHeader) {
    return false;
  }

  // Compute the expected signature over the raw body — lowercase hex.
  const expectedSignature = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody)
    .digest('hex')
    .toLowerCase();

  // Timing-safe comparison; guard against length/format mismatch.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.toLowerCase(), 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// AiPrise callback endpoint — must use the raw body for signature verification.
app.post('/webhooks/aiprise',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const signature = req.headers['x-hmac-signature'];

    // Verify the signature before trusting the payload.
    if (!verifyAiPriseWebhook(req.body, signature, process.env.AIPRISE_API_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification.
    const payload = JSON.parse(req.body.toString());
    // Event callbacks (events_callback_url) and token sharing webhooks name their
    // event in one of these fields. A decision callback (callback_url) has none.
    const eventType =
      payload.event_type ||
      payload.user_profile_event_type ||
      payload.business_profile_event_type ||
      payload.token_sharing_event_type;
    if (eventType) {
      console.log(`AiPrise event ${eventType}`);
      // Your code: handle the events you use, such as CASE_STATUS_UPDATE.
      return res.status(200).send('OK');
    }

    // Decision callback: the final result of a verification session.
    const sessionId = payload.verification_session_id;
    const clientRef = payload.client_reference_id;
    // The API reference names this field verification_result; AiPrise's callback
    // pages print aiprise_summary.decision instead, so read both.
    const result =
      payload.aiprise_summary?.verification_result ?? payload.aiprise_summary?.decision;

    console.log(
      `AiPrise callback for session ${sessionId}` +
      (clientRef ? ` (ref: ${clientRef})` : '') +
      ` → ${result}`
    );

    switch (result) {
      case 'APPROVED':
        console.log('Verification approved');
        // Your code: Provision access, mark the customer verified.
        break;

      case 'DECLINED':
        console.log('Verification declined');
        // Your code: Block onboarding, request resubmission, flag for review.
        break;

      case 'REVIEW':
      case 'MANUAL_REVIEW':
        console.log('Verification needs manual review');
        // Your code: Route to a human analyst / compliance queue.
        break;

      case 'UNKNOWN':
      case 'FAILED':
        console.log('Verification result unknown');
        // Your code: Retry or investigate.
        break;

      default:
        console.log(`Unhandled result: ${result}`);
    }

    // Return 200 to acknowledge receipt.
    res.status(200).send('OK');
  }
);

// Health check endpoint.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing.
module.exports = { app, verifyAiPriseWebhook };

// Start the server only when run directly (not when imported for testing).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/aiprise`);
  });
}
