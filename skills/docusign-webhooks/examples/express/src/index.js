// Generated with: docusign-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a DocuSign Connect webhook signature.
 *
 * DocuSign signs the raw request body with HMAC-SHA256 keyed on the Connect
 * HMAC secret and sends the base64 digest in `X-DocuSign-Signature-1`. When
 * multiple HMAC keys are active it sends one header per key
 * (`X-DocuSign-Signature-1`, `-2`, ...). Only one header needs to match.
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {object} headers - Request headers (lowercased keys, as Express provides)
 * @param {string} secret - DocuSign Connect HMAC secret
 * @returns {boolean} - Whether any signature header is valid
 */
function verifyDocuSignWebhook(rawBody, headers, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  const signatures = Object.keys(headers)
    .filter((h) => h.toLowerCase().startsWith('x-docusign-signature-'))
    .map((h) => headers[h]);

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      // Different lengths = invalid
      return false;
    }
  });
}

// DocuSign webhook endpoint - must use raw body for signature verification
app.post(
  '/webhooks/docusign',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    // Verify webhook signature against every X-DocuSign-Signature-N header
    if (!verifyDocuSignWebhook(req.body, req.headers, process.env.DOCUSIGN_HMAC_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString('utf8'));
    const event = payload.event;
    const envelopeId = payload.data && payload.data.envelopeId;

    console.log(`Received ${event} event for envelope ${envelopeId}`);

    // Handle the event based on the `event` field in the JSON body
    switch (event) {
      case 'envelope-sent':
        console.log('Envelope sent:', envelopeId);
        // Your code: Track that the envelope was emailed to recipients
        break;

      case 'envelope-delivered':
        console.log('Envelope opened:', envelopeId);
        // Your code: Update status to "viewed"
        break;

      case 'envelope-completed':
        console.log('Envelope completed:', envelopeId);
        // Your code: Download signed documents, mark deal as signed, etc.
        break;

      case 'envelope-declined':
        console.log('Envelope declined:', envelopeId);
        // Your code: Notify sender, halt workflow
        break;

      case 'envelope-voided':
        console.log('Envelope voided:', envelopeId);
        // Your code: Clean up any pending state
        break;

      case 'recipient-sent':
        console.log('Recipient notified:', envelopeId);
        // Your code: Track per-recipient delivery
        break;

      case 'recipient-delivered':
        console.log('Recipient opened documents:', envelopeId);
        // Your code: Update per-recipient status
        break;

      case 'recipient-completed':
        console.log('Recipient completed:', envelopeId);
        // Your code: Advance signing workflow to the next recipient
        break;

      case 'recipient-declined':
        console.log('Recipient declined:', envelopeId);
        // Your code: Notify sender
        break;

      case 'recipient-authenticationfailed':
        console.log('Recipient authentication failed:', envelopeId);
        // Your code: Flag for review
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 2xx to acknowledge receipt (DocuSign retries on >= 400 for up to 15 days)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyDocuSignWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/docusign`);
  });
}
