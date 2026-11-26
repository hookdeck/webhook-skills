// Generated with: aws-sns-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const MessageValidator = require('sns-validator');

const app = express();

// sns-validator verifies the RSA signature: it fetches the X.509 cert from
// SigningCertURL (enforcing an sns.<region>.amazonaws.com HTTPS host), rebuilds
// the canonical string, and checks the signature for SignatureVersion 1 (SHA1)
// and 2 (SHA256). No shared secret is involved.
const validator = new MessageValidator();

// Optional allowlist: only trust messages from this topic ARN.
const ALLOWED_TOPIC_ARN = process.env.AWS_SNS_TOPIC_ARN;

function validate(message) {
  return new Promise((resolve, reject) => {
    validator.validate(message, (err, msg) => (err ? reject(err) : resolve(msg)));
  });
}

// SNS sends Content-Type: text/plain, so capture the raw body for any type.
// We parse it ourselves — SNS signs specific envelope fields, and sns-validator
// verifies the parsed object.
app.post(
  '/webhooks/aws-sns',
  express.text({ type: '*/*', limit: '256kb' }),
  async (req, res) => {
    // x-amz-sns-message-type lets us branch without parsing the body first.
    const messageType = req.headers['x-amz-sns-message-type'];
    if (!messageType) {
      return res.status(400).send('Missing x-amz-sns-message-type header');
    }

    let message;
    try {
      message = JSON.parse(req.body);
    } catch {
      return res.status(400).send('Invalid JSON body');
    }

    // Verify authenticity before doing anything else.
    try {
      await validate(message);
    } catch (err) {
      console.error('SNS signature verification failed:', err.message);
      return res.status(400).send('Invalid signature');
    }

    // Optionally reject topics we don't expect (there is no shared secret).
    if (ALLOWED_TOPIC_ARN && message.TopicArn !== ALLOWED_TOPIC_ARN) {
      console.warn('Rejected message from unexpected topic:', message.TopicArn);
      return res.status(403).send('Untrusted topic');
    }

    switch (messageType) {
      case 'SubscriptionConfirmation': {
        // Confirm the subscription by visiting SubscribeURL, or SNS never
        // delivers notifications.
        try {
          const response = await fetch(message.SubscribeURL);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          console.log('Subscription confirmed for topic:', message.TopicArn);
        } catch (err) {
          console.error('Failed to confirm subscription:', err.message);
          return res.status(500).send('Failed to confirm subscription');
        }
        break;
      }

      case 'Notification': {
        // De-duplicate on message.MessageId — SNS retries can redeliver.
        console.log('Notification received:', message.MessageId);
        console.log('Subject:', message.Subject);
        console.log('Message:', message.Message);
        // Your code: process the notification (message.Message is often JSON).
        break;
      }

      case 'UnsubscribeConfirmation': {
        // The endpoint was unsubscribed. Re-subscribe here if unexpected.
        console.log('Unsubscribe confirmation for topic:', message.TopicArn);
        break;
      }

      default:
        console.log('Unhandled SNS message type:', messageType);
    }

    // Respond 2xx within ~15s or SNS treats delivery as failed and retries.
    res.status(200).send('OK');
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/aws-sns`);
  });
}
