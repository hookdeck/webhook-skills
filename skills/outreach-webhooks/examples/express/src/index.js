// Generated with: outreach-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Outreach sends Outreach-Webhook-Signature (bare hex HMAC-SHA256 of the raw
// body, keyed with the webhook's secret) only when the webhook has a secret.
// https://developers.outreach.io/api/webhooks#authenticity-validation
function verifyOutreachSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so check length first
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhooks/outreach',
  // Raw body for all content types (Outreach may send application/vnd.api+json)
  express.raw({ type: '*/*', limit: '5mb' }),
  (req, res) => {
    const secret = process.env.OUTREACH_WEBHOOK_SECRET;
    if (!secret) {
      console.error('OUTREACH_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.headers['outreach-webhook-signature'];

    if (!signature) {
      // Usually means the webhook was created without a `secret` attribute
      return res.status(400).send('Missing Outreach-Webhook-Signature header');
    }

    if (!verifyOutreachSignature(rawBody, signature, secret)) {
      console.error('Outreach webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // JSON:API payload: data {type, id, attributes}, meta {deliveredAt, eventName}
    const eventName = payload.meta && payload.meta.eventName;
    const data = payload.data || {};

    switch (eventName) {
      case 'prospect.created':
        console.log(`Prospect created: ${data.id}`);
        break;
      case 'prospect.updated':
        console.log(`Prospect updated: ${data.id}`);
        break;
      case 'sequenceState.created':
        console.log(`Prospect added to a sequence (sequenceState ${data.id})`);
        break;
      case 'call.created':
        console.log(`Call logged: ${data.id}`);
        break;
      case 'task.completed':
        console.log(`Task completed: ${data.id}`);
        break;
      case 'mailing.replied':
        console.log(`Mailing replied: ${data.id}`);
        break;
      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    // Respond fast: Outreach times out after 5 seconds and never retries on a status code
    res.json({ received: true });
  }
);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Outreach webhook server listening on port ${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/outreach`);
});

// For testing
module.exports = { app, server, verifyOutreachSignature };
