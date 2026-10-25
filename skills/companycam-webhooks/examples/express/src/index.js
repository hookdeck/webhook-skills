// Generated with: companycam-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const webhookToken = process.env.COMPANYCAM_WEBHOOK_TOKEN;

/**
 * Verify a CompanyCam webhook signature.
 * X-CompanyCam-Signature = Base64(HMAC-SHA1(webhook token, raw body)).
 * The base64 strings are compared as equal-length UTF-8 buffers.
 */
function verifyCompanyCamSignature(rawBody, signature, token) {
  if (!signature || !token) return false;
  const expected = crypto.createHmac('sha1', token).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}

// CompanyCam webhook endpoint - raw body for any content type so verification works
app.post(
  '/webhooks/companycam',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    const signature = req.headers['x-companycam-signature'];

    if (!webhookToken) {
      console.error('COMPANYCAM_WEBHOOK_TOKEN is not set');
      return res.status(500).send('Webhook token not configured');
    }

    if (!signature) {
      return res.status(401).send('Missing X-CompanyCam-Signature header');
    }

    if (!verifyCompanyCamSignature(rawBody, signature, webhookToken)) {
      console.error('CompanyCam webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification. `event_type` carries the event name.
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const eventType = event.event_type;
    const payload = event.payload || {};

    switch (eventType) {
      case 'project.created':
        console.log('Project created:', payload.id);
        // TODO: sync the new project to your CRM / job system
        break;

      case 'project.updated':
        console.log('Project updated:', payload.id);
        // TODO: keep your records in sync
        break;

      case 'photo.created':
        console.log('Photo created:', payload.id);
        // TODO: back up the photo, run tagging, etc.
        break;

      case 'photo.updated':
        console.log('Photo updated:', payload.id);
        // TODO: refresh derived assets
        break;

      case 'comment.created':
        console.log('Comment created:', payload.id);
        // TODO: notify the team
        break;

      case 'document.created':
        console.log('Document created:', payload.id);
        // TODO: sync the document
        break;

      case 'todo_list.completed':
        console.log('Checklist completed:', payload.id);
        // TODO: trigger close-out workflow
        break;

      case 'task.completed':
        console.log('Checklist task completed:', payload.id);
        // TODO: track progress
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // CompanyCam expects exactly HTTP 200; anything else is retried.
    res.status(200).json({ received: true });
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/companycam`);
  });
}
