// Generated with: sohar-health-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Sohar Health (Svix) signed, whatever the content type
app.post('/webhooks/sohar-health', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SOHAR_HEALTH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('SOHAR_HEALTH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = req.headers['svix-id'] ? 'svix' : 'webhook';
  const id = req.headers[`${prefix}-id`];
  const timestamp = req.headers[`${prefix}-timestamp`];
  const signature = req.headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(req.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Sohar Health webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Bodies are flat: `event` plus the resource id (verificationId | discoveryId | flowRunId).
  // `status` is the resource's state, not the event type. Sandbox events carry a `sandbox.` prefix.
  const { event } = payload;
  // No retry schedule or ordering is documented: deduplicate on svix-id (or resource id + status)
  console.log(`Received Sohar Health webhook ${event}`);

  switch (event) {
    case 'verification.updated':
    case 'sandbox.verification.updated':
      // A verification completed (e.g. status "complete.eligible")
      console.log('Verification updated:', payload.verificationId, payload.id, payload.status);
      break;
    case 'verification.pending':
    case 'sandbox.verification.pending':
      // Not resolved immediately; a verification.updated follows when it completes
      console.log('Verification pending:', payload.verificationId, payload.id, payload.status);
      break;
    case 'discovery.updated':
    case 'sandbox.discovery.updated':
      console.log('Discovery updated:', payload.discoveryId, payload.id, payload.status);
      break;
    case 'flow.updated':
    case 'sandbox.flow.updated':
      console.log('Flow run updated:', payload.flowRunId, payload.flowId, payload.status, payload.stateId);
      break;
    case 'flow.callback':
    case 'sandbox.flow.callback':
      // The flow run is waiting for input; `input` is a JSON Schema describing it
      console.log('Flow run awaiting input:', payload.flowRunId, JSON.stringify(payload.input));
      break;
    default:
      // Return 200 for events you don't handle (the documented list may not be exhaustive)
      console.log('Unhandled event:', event);
  }

  res.status(200).json({ success: true, event });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Sohar Health webhook server running on http://localhost:${PORT}/webhooks/sohar-health`);
  });
}
