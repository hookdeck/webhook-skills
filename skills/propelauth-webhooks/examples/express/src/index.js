// Generated with: propelauth-webhooks skill
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

// IMPORTANT: express.raw() with type '*/*' keeps the exact bytes PropelAuth (Svix)
// signed, whatever content type the request arrives with.
app.post('/webhooks/propelauth', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.PROPELAUTH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('PROPELAUTH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature and enforces the 5-minute timestamp window.
    new Webhook(secret).verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('PropelAuth webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // PropelAuth's docs say the payload includes the event type but don't name the
  // field; read `event_type`, falling back to `type`.
  const type = event?.event_type ?? event?.type ?? null;
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received PropelAuth webhook ${svixId}: ${type}`);

  switch (type) {
    case 'user.created':
      console.log('New user signed up:', event.user_id);
      break;
    case 'user.updated':
      // Only the ID is sent so out-of-order deliveries can't overwrite newer data
      console.log('User updated, fetch the latest from the API:', event.user_id);
      break;
    case 'user.deleted':
      console.log('User deleted:', event.user_id);
      break;
    case 'org.created':
      console.log('Organization created:', event.org_id);
      break;
    case 'user.added_to_org':
      console.log('User added to org:', event.user_id, event.org_id);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`PropelAuth webhook server running on http://localhost:${PORT}/webhooks/propelauth`);
  });
}
