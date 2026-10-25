// Generated with: huntress-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

// Huntress's article describes the body only as "a JSON payload describing the event".
// Use `type` when the body has one; otherwise report the event as untyped.
export function parseHuntressEvent(body) {
  const type = body && typeof body.type === 'string' ? body.type : null;
  return { type, payload: body ?? {} };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw({ type: '*/*' }) keeps the exact bytes Huntress signed,
// whatever Content-Type the request arrives with
app.post('/webhooks/huntress', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.HUNTRESS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('HUNTRESS_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    // v1, signature and enforces a fixed 5-minute timestamp window. Hookdeck retries
    // and replays resend the original timestamp, so use the manual verifier in
    // references/verification.md if late retries must still verify.
    new Webhook(secret).verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Huntress webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { type, payload } = parseHuntressEvent(body);
  // svix-id is stable across retries: use it to deduplicate, and log it so you can
  // match it to the Portal's "View Delivery Attempts" page
  console.log(`Received Huntress webhook ${svixId}: ${type ?? '(untyped payload)'}`);

  // Verify, enqueue, return 200 fast: do the real work out of band
  console.log('Huntress payload:', JSON.stringify(payload));

  res.status(200).json({ success: true, id: svixId, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Huntress webhook server running on http://localhost:${PORT}/webhooks/huntress`);
  });
}
