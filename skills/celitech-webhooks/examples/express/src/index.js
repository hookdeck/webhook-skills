// Generated with: celitech-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

// Celitech deliveries carry svix-* headers. Hookdeck also accepts the Standard
// Webhooks webhook-* names when svix-id is absent, so do the same. The three
// values are handed to the library under the svix-* names it expects.
export function resolveSignatureHeaders(headers) {
  const prefix = headers['svix-id'] ? 'svix' : 'webhook';
  const id = headers[`${prefix}-id`];
  const timestamp = headers[`${prefix}-timestamp`];
  const signature = headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature) return null;
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Celitech signed, whatever the content type
app.post('/webhooks/celitech', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CELITECH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CELITECH_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const sigHeaders = resolveSignatureHeaders(req.headers);
  if (!sigHeaders) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, entry.
    // The library also enforces a fixed 5-minute timestamp window; see
    // references/verification.md for a manual verifier without it.
    new Webhook(secret).verify(req.body, sigHeaders);
  } catch (err) {
    console.error('Celitech webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The body is flat: `type` plus the event's fields (no `data` wrapper).
  // svix-id is stable across retries: use it to deduplicate.
  console.log(`Received Celitech webhook ${sigHeaders['svix-id']}: ${event.type}`);

  switch (event.type) {
    case 'consumption.threshold.reached':
      console.log(
        `Purchase ${event.purchaseId} at ${event.actualPercentage}% ` +
          `(threshold ${event.notificationPercentage}%, ${event.dataUsageRemainingInGB} of ${event.dataLimitInGB} GB left)`
      );
      break;
    case 'esim.downloaded':
      console.log('eSIM downloaded:', event.iccid);
      break;
    case 'esim.installed':
      console.log('eSIM installed:', event.iccid);
      break;
    case 'esim.enabled':
      console.log('eSIM enabled:', event.iccid);
      break;
    case 'esim.disabled':
      console.log('eSIM disabled:', event.iccid);
      break;
    case 'esim.deleted':
      console.log('eSIM deleted:', event.iccid);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  res.status(200).json({ success: true, type: event.type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Celitech webhook server running on http://localhost:${PORT}/webhooks/celitech`);
  });
}
