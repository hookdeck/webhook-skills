// Generated with: openmeter-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { Webhook, WebhookVerificationError } from 'svix';
import { pathToFileURL } from 'node:url';

const app = express();

// OpenMeter webhook endpoint - express.raw() keeps the exact bytes OpenMeter signed
app.post(
  '/webhooks/openmeter',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const secret = process.env.OPENMETER_WEBHOOK_SECRET;
    if (!secret) {
      console.error('OPENMETER_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const svixHeaders = {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    };
    if (!svixHeaders['svix-id'] || !svixHeaders['svix-timestamp'] || !svixHeaders['svix-signature']) {
      return res.status(400).json({ error: 'Missing svix-id, svix-timestamp or svix-signature header' });
    }

    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

    // Verify with the svix SDK: HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{raw body}",
    // keyed with the base64-decoded secret, plus a 5-minute timestamp tolerance.
    try {
      new Webhook(secret).verify(payload, svixHeaders);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        console.error('OpenMeter webhook verification failed:', err.message);
        return res.status(400).json({ error: 'Invalid signature' });
      }
      console.error('Unexpected verification error:', err);
      return res.status(500).json({ error: 'Verification error' });
    }

    // Verified - now it is safe to parse the { id, timestamp, type, data } envelope
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const data = event.data || {};
    switch (event.type) {
      case 'entitlements.balance.threshold':
        console.log('Entitlement threshold reached:', {
          subject: data.subject?.key,
          feature: data.feature?.key,
          threshold: data.threshold,
          usage: data.value?.usage,
          hasAccess: data.value?.hasAccess,
        });
        // TODO: notify the customer, or block access at 100%
        break;

      case 'entitlements.reset':
        console.log('Entitlement reset:', {
          subject: data.subject?.key,
          feature: data.feature?.key,
        });
        // TODO: clear over-quota flags, restore access
        break;

      case 'invoice.created':
        console.log('Invoice created:', { id: data.id, number: data.number, status: data.status });
        // TODO: sync the invoice to your accounting system
        break;

      case 'invoice.updated':
        console.log('Invoice updated:', { id: data.id, number: data.number, status: data.status });
        // TODO: react to the new invoice state
        break;

      default:
        console.log('Unhandled OpenMeter event type:', event.type);
    }

    // Acknowledge quickly; OpenMeter (via Svix) retries non-2xx responses
    res.status(200).json({ received: true, id: event.id, type: event.type });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/openmeter`);
  });
}
