// Generated with: mux-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const Mux = require('@mux/ts').default;

// No API token is needed just to verify webhooks
const mux = new Mux();

const app = express();

// Mux webhook endpoint - must use raw body for signature verification
app.post('/webhooks/mux',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    if (!req.headers['mux-signature']) {
      return res.status(400).send('Missing mux-signature header');
    }

    let event;
    try {
      // Verify the mux-signature header (HMAC-SHA256 of "<t>.<raw body>",
      // 5-minute tolerance) and parse the JSON body in one step
      event = await mux.webhooks.unwrap(
        req.body,
        req.headers,
        process.env.MUX_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Mux webhook verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event based on type
    switch (event.type) {
      case 'video.asset.created':
        console.log('Asset created:', event.data.id);
        // TODO: Record the asset and show it as processing
        break;

      case 'video.asset.ready':
        console.log('Asset ready:', event.data.id, event.data.playback_ids);
        // TODO: Store the playback ID and publish the video
        break;

      case 'video.asset.errored':
        console.log('Asset errored:', event.data.id, event.data.errors);
        // TODO: Mark the asset as failed and notify the uploader
        break;

      case 'video.asset.deleted':
        console.log('Asset deleted:', event.data.id);
        // TODO: Remove the asset from your catalog
        break;

      case 'video.asset.live_stream_completed':
        console.log('Live stream asset completed:', event.data.id);
        // TODO: Publish the recorded replay
        break;

      case 'video.upload.asset_created':
        console.log('Upload created asset:', event.data.id, event.data.asset_id);
        // TODO: Link the new asset to the user who uploaded it
        break;

      case 'video.live_stream.active':
        console.log('Live stream active:', event.data.id);
        // TODO: Show the stream as live
        break;

      case 'video.live_stream.idle':
        console.log('Live stream idle:', event.data.id);
        // TODO: Show the stream as ended
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mux`);
  });
}
