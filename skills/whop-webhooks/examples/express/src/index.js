require('dotenv').config({ quiet: true });
const express = require('express');
const { unwrapWebhook } = require('@whop/sdk/helpers');

const app = express();

// Whop signs "{webhook-id}.{webhook-timestamp}.{raw body}", so the route needs the
// raw bytes. express.raw() must run before any JSON parser on this route.
app.post('/webhooks/whop', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('WHOP_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    // Verifies the Standard Webhooks signature (HMAC-SHA256, v1,<base64>) and the
    // 5-minute timestamp window, then returns the parsed body. The secret is passed
    // exactly as Whop issued it (ws_...).
    event = unwrapWebhook(req.body.toString('utf8'), {
      headers: req.headers,
      key: secret,
    });
  } catch (err) {
    console.error('Whop signature verification failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  // Retries reuse the same webhook-id: store it and skip duplicates in production.
  switch (event.type) {
    case 'payment.succeeded':
      console.log('Payment succeeded:', event.data.id);
      break;
    case 'payment.failed':
      console.log('Payment failed:', event.data.id);
      break;
    case 'membership.activated':
      console.log('Membership activated:', event.data.id);
      break;
    case 'membership.deactivated':
      console.log('Membership deactivated:', event.data.id);
      break;
    case 'refund.created':
      console.log('Refund created:', event.data.id);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  // Respond 2xx within 5 seconds or Whop retries.
  res.status(200).json({ received: true });
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Whop webhook server listening on port ${port}`));
}
