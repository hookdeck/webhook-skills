require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

/**
 * Verify SendGrid webhook signature using ECDSA
 */
function verifySignature(publicKey, payload, signature, timestamp) {
  try {
    // Decode the base64 signature
    const decodedSignature = Buffer.from(signature, 'base64');

    // Create the signed content: timestamp + payload
    const signedContent = timestamp + payload;

    // Create verifier with SHA256
    const verifier = crypto.createVerify('sha256');
    verifier.update(signedContent);

    // Add PEM headers if not present
    let pemKey = publicKey;
    if (!pemKey.includes('BEGIN PUBLIC KEY')) {
      pemKey = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
    }

    // Verify the signature using the public key
    return verifier.verify(pemKey, decodedSignature);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// SendGrid webhook endpoint - MUST use raw body for signature verification
app.post('/webhooks/sendgrid', express.raw({ type: 'application/json' }), (req, res) => {
  // Get signature headers (check both cases for compatibility)
  const signature = req.get('X-Twilio-Email-Event-Webhook-Signature') ||
                    req.get('x-twilio-email-event-webhook-signature');
  const timestamp = req.get('X-Twilio-Email-Event-Webhook-Timestamp') ||
                    req.get('x-twilio-email-event-webhook-timestamp');

  // Validate required headers
  if (!signature || !timestamp) {
    console.error('Missing required headers');
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  const publicKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
  if (!publicKey) {
    console.error('SENDGRID_WEBHOOK_VERIFICATION_KEY not configured');
    return res.status(500).json({ error: 'Webhook verification not configured' });
  }

  // Get raw payload as string
  const payload = req.body.toString();

  // Verify signature
  if (!verifySignature(publicKey, payload, signature, timestamp)) {
    console.error('Invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Parse and process events
  let events;
  try {
    events = JSON.parse(payload);
  } catch (error) {
    console.error('Invalid JSON payload:', error);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // Process each event
  console.log(`Received ${events.length} SendGrid events`);

  for (const event of events) {
    console.log(`Event: ${event.event} for ${event.email} at ${new Date(event.timestamp * 1000).toISOString()}`);

    // Handle specific event types
    switch (event.event) {
      case 'delivered':
        console.log(`Email delivered to ${event.email}`);
        break;
      case 'bounce':
        console.log(`Email bounced for ${event.email}: ${event.reason}`);
        // Update your database to mark email as invalid
        break;
      case 'spam report':
        console.log(`Spam report from ${event.email}`);
        // Remove from mailing lists
        break;
      case 'unsubscribe':
        console.log(`Unsubscribe from ${event.email}`);
        // Update subscription preferences
        break;
      case 'group unsubscribe':
        console.log(`Group unsubscribe from ${event.email}`);
        // Update group subscription preferences
        break;
      case 'group resubscribe':
        console.log(`Group resubscribe from ${event.email}`);
        // Update group subscription preferences
        break;
      case 'open':
        console.log(`Email opened by ${event.email}`);
        // Track engagement metrics
        break;
      case 'click':
        console.log(`Link clicked by ${event.email}: ${event.url}`);
        // Track click analytics
        break;
      case 'deferred':
        console.log(`Email deferred for ${event.email}: ${event.reason}`);
        // Monitor delivery issues
        break;
      case 'dropped':
        console.log(`Email dropped for ${event.email}: ${event.reason}`);
        // Investigate drop reasons
        break;
      case 'processed':
        console.log(`Email processed for ${event.email}`);
        // Track processing status
        break;
      default:
        console.log(`Unhandled event type: ${event.event}`);
    }
  }

  // Return 200 to acknowledge receipt
  res.sendStatus(200);
});

// Start server only when not in test environment
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    console.log(`SendGrid webhook server listening on port ${port}`);
    console.log(`Webhook endpoint: http://localhost:${port}/webhooks/sendgrid`);
  });
}

// For testing
module.exports = { app, server };