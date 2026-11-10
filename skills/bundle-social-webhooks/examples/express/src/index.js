// Generated with: bundle-social-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const { Bundlesocial } = require('bundlesocial');

const app = express();

// The official SDK. Webhook verification only needs the signing secret; the
// API key is used by the SDK's API methods, not by webhooks.constructEvent().
const bundle = new Bundlesocial(process.env.BUNDLE_SOCIAL_API_KEY || '');

// bundle.social webhook endpoint - must use the raw body for signature verification.
// bundle.social signs the exact bytes it sends: x-signature = hex HMAC-SHA256(rawBody, secret).
app.post('/webhooks/bundle-social',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-signature'];
    const secret = process.env.BUNDLE_SOCIAL_WEBHOOK_SECRET;

    if (!signature || !secret || !Buffer.isBuffer(req.body)) {
      console.error('bundle.social webhook missing x-signature header, secret or body');
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      // Pass the raw body as a string. Passing a parsed object makes the SDK
      // re-serialize it, which changes the bytes and breaks the signature.
      event = bundle.webhooks.constructEvent(req.body.toString('utf8'), signature, secret);
    } catch (err) {
      console.error('bundle.social webhook signature verification failed:', err.message);
      return res.status(400).send('Invalid signature');
    }

    // Every delivery is { type, data }. bundle.social may add event types at any
    // time (webhooks with no event filter receive them), so ignore unknown types.
    const { type, data } = event;
    switch (type) {
      case 'post.published':
        // Fires for successes AND permanent failures - check data.status.
        if (data.status === 'POSTED') {
          console.log(`Post ${data.id} is live`, data.externalData);
        } else {
          console.log(`Post ${data.id} failed (${data.status}):`, data.error || data.errors);
        }
        break;
      case 'post.externally-deleted':
        console.log(`Post ${data.postId ?? data.id} was deleted on ${data.socialAccountType}`);
        break;
      case 'comment.published':
        console.log(`Comment ${data.id} finished with status ${data.status}`);
        break;
      case 'social-account.created':
        console.log(`Social account connected: ${data.type} @${data.username}`);
        break;
      case 'social-account.updated': {
        // socialAction is present for disconnection checks and failed token refreshes
        const deleteOn = data.socialAction?.details?.deleteOn;
        console.log(`Social account updated: ${data.id}` +
          (deleteOn ? ` - reconnect before ${deleteOn}` : ''));
        break;
      }
      case 'social-account.deleted':
        console.log(`Social account removed: ${data.id}`);
        break;
      case 'team.created':
        console.log(`Team created: ${data.name} (${data.id})`);
        break;
      case 'team.updated':
        console.log(`Team updated: ${data.id}`);
        break;
      case 'team.deleted':
        console.log(`Team deleted: ${data.id}`);
        break;
      default:
        console.log(`Unhandled bundle.social event type: ${type}`);
    }

    // Respond 2xx within 15 seconds; move slow work to a queue.
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bundle-social`);
  });
}
