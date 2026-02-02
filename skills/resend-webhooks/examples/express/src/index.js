require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Svix signature (used by Resend for webhooks)
 */
function verifySvixSignature(payload, headers, secret, tolerance = 300) {
  const msgId = headers['svix-id'];
  const msgTimestamp = headers['svix-timestamp'];
  const msgSignature = headers['svix-signature'];

  if (!msgId || !msgTimestamp || !msgSignature) {
    return { valid: false, error: 'Missing required headers' };
  }

  // Check timestamp tolerance (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const timestamp = parseInt(msgTimestamp, 10);
  if (isNaN(timestamp) || Math.abs(now - timestamp) > tolerance) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  // Remove 'whsec_' prefix and decode secret
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  // Create signed content
  const signedContent = `${msgId}.${msgTimestamp}.${payload}`;

  // Compute expected signature
  const expectedSig = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // Check against provided signatures (may have multiple versions)
  const signatures = msgSignature.split(' ');
  for (const sig of signatures) {
    if (sig.startsWith('v1,')) {
      const providedSig = sig.slice(3);
      try {
        if (crypto.timingSafeEqual(
          Buffer.from(providedSig),
          Buffer.from(expectedSig)
        )) {
          return { valid: true };
        }
      } catch {
        // Length mismatch, continue checking
      }
    }
  }

  return { valid: false, error: 'Invalid signature' };
}

// Resend webhook endpoint - must use raw body for signature verification
app.post('/webhooks/resend',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const payload = req.body.toString();
    const headers = {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    };

    // Check for required headers
    if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
      console.error('Missing required Svix headers');
      return res.status(400).send('Missing webhook signature headers');
    }

    // Verify the webhook signature
    const verification = verifySvixSignature(
      payload,
      headers,
      process.env.RESEND_WEBHOOK_SECRET
    );

    if (!verification.valid) {
      console.error('Webhook signature verification failed:', verification.error);
      return res.status(400).send(`Webhook Error: ${verification.error}`);
    }

    // Parse the event
    let event;
    try {
      event = JSON.parse(payload);
    } catch (err) {
      console.error('Invalid JSON payload:', err.message);
      return res.status(400).send('Invalid JSON payload');
    }

    // Handle the event based on type
    switch (event.type) {
      case 'email.sent':
        console.log('Email sent:', event.data.email_id);
        // TODO: Update email status in your database
        break;

      case 'email.delivered':
        console.log('Email delivered:', event.data.email_id);
        // TODO: Mark email as delivered, track delivery metrics
        break;

      case 'email.delivery_delayed':
        console.log('Email delivery delayed:', event.data.email_id);
        // TODO: Monitor for delivery issues
        break;

      case 'email.bounced':
        console.log('Email bounced:', event.data.email_id);
        // TODO: Handle bounce, possibly remove from mailing list
        break;

      case 'email.complained':
        console.log('Email marked as spam:', event.data.email_id);
        // TODO: Unsubscribe user, prevent future sends
        break;

      case 'email.opened':
        console.log('Email opened:', event.data.email_id);
        // TODO: Track engagement metrics
        break;

      case 'email.clicked':
        console.log('Email link clicked:', event.data.email_id);
        // TODO: Track click-through rates
        break;

      case 'email.received':
        console.log('Inbound email received:', event.data.email_id);
        // TODO: Process inbound email (call API to get body/attachments)
        // const { data: email } = await resend.emails.receiving.get(event.data.email_id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/resend`);
  });
}
