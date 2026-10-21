// Generated with: crusoe-webhooks skill
// https://github.com/hookdeck/webhook-skills

import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Crusoe doesn't document an event-type field in the body (the event type is
// picked per endpoint in the Svix dashboard), so read one if present and
// otherwise recognise the documented remediation payload by its fields.
function getEventType(payload) {
  if (typeof payload.type === 'string') return payload.type;
  if (typeof payload.event_type === 'string') return payload.event_type;
  if (payload.workflow_type && payload.resource_id) return 'resource.automated_remediation';
  return 'unknown';
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Svix signed.
app.post('/webhooks/crusoe',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const secret = process.env.CRUSOE_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing required webhook headers' });
    }

    try {
      // Crusoe delivers through Svix: HMAC-SHA256 over "id.timestamp.body".
      // The SDK checks every v1 signature and a 5-minute timestamp window.
      new Webhook(secret).verify(req.body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message);
      const detail = /timestamp/i.test(err.message || '') ? 'Invalid timestamp' : 'Invalid signature';
      return res.status(400).json({ error: detail });
    }

    // Verified: now parse. Payload structure varies by event type.
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const eventType = getEventType(payload);
    console.log(`Received Crusoe webhook ${svixId}: ${eventType}`);

    switch (eventType) {
      case 'resource.automated_remediation':
        console.log('Automated remediation:', {
          status: payload.status,
          workflow: payload.workflow_type,
          resource: payload.resource_name || payload.resource_id,
          cluster: payload.cluster_name || payload.cluster_id,
          error: payload.triggered_by?.error_name,
        });
        break;
      default:
        // Budget, organization and Managed AI payloads aren't documented yet.
        console.log('Unhandled Crusoe notification, fields:', Object.keys(payload));
    }

    res.status(200).json({ received: true, type: eventType });
  }
);

const server = app.listen(PORT, () => {
  console.log(`Crusoe webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/crusoe`);
});

export { app, server };
