// Generated with: fathom-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const { Fathom } = require('fathom-typescript');

const app = express();

/**
 * Handle a verified Fathom "new meeting content ready" payload.
 *
 * Fathom sends one webhook type: the Meeting object, fired once when a
 * recording's content is ready. There is no event-type field to switch on.
 * transcript, default_summary, action_items and crm_matches are only present
 * when the matching include_* option was enabled on the webhook.
 */
function handleMeeting(meeting, webhookId) {
  console.log(`Meeting ready: "${meeting.title}" (recording ${meeting.recording_id}, delivery ${webhookId})`);
  console.log(`Recorded by: ${meeting.recorded_by?.email}`);

  if (meeting.default_summary?.markdown_formatted) {
    console.log('Summary:', meeting.default_summary.markdown_formatted);
  }

  if (Array.isArray(meeting.action_items)) {
    for (const item of meeting.action_items) {
      console.log(`Action item: ${item.description} (assignee: ${item.assignee?.email ?? 'unassigned'})`);
    }
  }

  if (Array.isArray(meeting.transcript)) {
    console.log(`Transcript: ${meeting.transcript.length} lines`);
  }

  // TODO: Sync notes to your CRM, post the summary to Slack, create tasks, etc.
  // Deduplicate on webhookId: it stays the same when Fathom retries a delivery.
}

// Fathom webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/fathom',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const secret = process.env.FATHOM_WEBHOOK_SECRET;
    if (!secret) {
      console.error('FATHOM_WEBHOOK_SECRET is not set');
      return res.status(500).send('Server configuration error');
    }

    const webhookId = req.headers['webhook-id'];
    const webhookTimestamp = req.headers['webhook-timestamp'];
    const webhookSignature = req.headers['webhook-signature'];

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return res.status(400).send('Missing webhook-id, webhook-timestamp or webhook-signature header');
    }

    let meeting;
    try {
      // Verifies HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}"
      // and rejects timestamps more than 5 minutes old. Returns the parsed payload.
      meeting = Fathom.verifyWebhook(secret, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      }, req.body);
    } catch (err) {
      console.error('Fathom webhook verification failed:', err.message);
      return res.status(400).send('Invalid signature');
    }

    try {
      handleMeeting(meeting, webhookId);
    } catch (err) {
      console.error('Error handling Fathom webhook:', err);
      return res.status(500).send('Internal error');
    }

    // Return 2xx quickly - non-2xx responses and timeouts are retried
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fathom`);
  });
}
