// Generated with: svix-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { Webhook } = require('svix');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Svix webhook endpoint
// IMPORTANT: use express.raw() so we verify the exact raw body bytes.
app.post('/webhooks/svix',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const secret = process.env.SVIX_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Svix sends svix-* headers; Standard Webhooks senders may use webhook-*.
    // The svix SDK accepts either set, so forward whichever is present.
    const svixId = req.headers['svix-id'] || req.headers['webhook-id'];
    const svixTimestamp = req.headers['svix-timestamp'] || req.headers['webhook-timestamp'];
    const svixSignature = req.headers['svix-signature'] || req.headers['webhook-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing required webhook headers' });
    }

    try {
      const wh = new Webhook(secret);
      // Pass the RAW body (Buffer) — never re-serialized JSON. As of svix 2.x
      // verify() returns undefined, so the payload is parsed separately below.
      wh.verify(req.body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message || err);
      const msg = (err && err.message) || '';
      const detail = /timestamp/i.test(msg)
        ? 'Timestamp too old'
        : 'Invalid signature';
      return res.status(400).json({ error: detail });
    }

    // Verified — only now is it safe to parse.
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Events are defined by the upstream sender; envelope is { type, data }.
    console.log(`Received Svix webhook: ${event.type}`);

    switch (event.type) {
      case 'invoice.paid':
        console.log('Invoice paid:', { id: event.data?.id });
        break;
      case 'user.created':
        console.log('User created:', { id: event.data?.id });
        break;
      case 'user.updated':
        console.log('User updated:', { id: event.data?.id });
        break;
      case 'message.sent':
        console.log('Message sent:', { id: event.data?.id });
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }

    res.status(200).json({ success: true, type: event.type });
  }
);

const server = app.listen(PORT, () => {
  console.log(`Svix webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/svix`);
});

module.exports = { app, server };
