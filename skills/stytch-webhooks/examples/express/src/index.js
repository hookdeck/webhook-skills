// Generated with: stytch-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

// Stytch bodies carry source, object_type and action but no combined type field
export function stytchEventType(body) {
  if (!body || !body.source || !body.object_type || !body.action) return null;
  return `${body.source}.${body.object_type}.${body.action}`.toLowerCase();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Stytch (Svix) signed
app.post('/webhooks/stytch', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.STYTCH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('STYTCH_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Stytch webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const type = stytchEventType(event);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Stytch webhook ${svixId}: ${type}`);

  // Webhooks are unordered: treat them as a signal and re-fetch from the Stytch API
  switch (type) {
    case 'direct.user.create':
      console.log('User created:', event.id);
      break;
    case 'direct.user.update':
      console.log('User updated:', event.id);
      break;
    case 'direct.organization.create':
    case 'dashboard.organization.create':
      console.log('Organization created:', event.id);
      break;
    case 'direct.member.update':
    case 'scim.member.update':
      console.log('Member updated:', event.id);
      break;
    case 'direct.saml_connection.delete':
      // DELETE events carry only the id, no entity object
      console.log('SAML connection deleted:', event.id);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Stytch webhook server running on http://localhost:${PORT}/webhooks/stytch`);
  });
}
