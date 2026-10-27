// Generated with: hexclave-webhooks skill
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

// Hexclave (via Svix) sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names
function readSignatureHeaders(headers) {
  const prefix = headers['svix-id'] ? 'svix' : 'webhook';
  return {
    id: headers[`${prefix}-id`],
    timestamp: headers[`${prefix}-timestamp`],
    signature: headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Svix signed, whatever the content type
app.post('/webhooks/hexclave', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.HEXCLAVE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('HEXCLAVE_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { id, timestamp, signature } = readSignatureHeaders(req.headers);
  if (!id || !timestamp || !signature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(req.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Hexclave webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The body is { type, data }: `type` is the event name, `data` the user, team, membership or permission
  const { type, data } = payload ?? {};
  // The svix-id is stable across retries: use it to deduplicate
  console.log(`Received Hexclave webhook ${id}: ${type}`);

  switch (type) {
    case 'user.created':
      console.log('User created:', data?.id);
      break;
    case 'user.updated':
      console.log('User updated:', data?.id);
      break;
    case 'user.deleted':
      console.log('User deleted:', data?.id);
      break;
    case 'team.created':
      console.log('Team created:', data?.id, data?.display_name);
      break;
    case 'team.updated':
      console.log('Team updated:', data?.id, data?.display_name);
      break;
    case 'team.deleted':
      console.log('Team deleted:', data?.id);
      break;
    case 'team_membership.created':
      console.log('Team membership created:', data);
      break;
    case 'team_membership.deleted':
      console.log('Team membership deleted:', data);
      break;
    case 'team_permission.created':
      console.log('Team permission created:', data);
      break;
    case 'team_permission.deleted':
      console.log('Team permission deleted:', data);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Hexclave webhook server running on http://localhost:${PORT}/webhooks/hexclave`);
  });
}
