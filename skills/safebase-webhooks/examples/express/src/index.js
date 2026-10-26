// Generated with: safebase-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

// SafeBase doesn't document which body field carries the event name (the test
// event has none, real events do), so check the likely candidates.
export function getEventName(body) {
  for (const key of ['eventType', 'event_type', 'type', 'event']) {
    if (body && typeof body[key] === 'string' && body[key]) return body[key];
  }
  return null;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes SafeBase signed, for any content type
app.post('/webhooks/safebase', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SAFEBASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SAFEBASE_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // SafeBase doesn't name the headers; svix-* is inferred, so fall back to the
  // webhook-* prefix (Svix's other prefix) when the svix-* headers are absent.
  const svixId = req.headers['svix-id'] ?? req.headers['webhook-id'];
  const svixTimestamp = req.headers['svix-timestamp'] ?? req.headers['webhook-timestamp'];
  const svixSignature = req.headers['svix-signature'] ?? req.headers['webhook-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature and enforces a fixed 5-minute timestamp window. That window
    // rejects late Hookdeck retries/replays: see references/verification.md.
    new Webhook(secret).verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('SafeBase webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const type = getEventName(body);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received SafeBase webhook ${svixId}: ${type ?? '(no event name)'}`);

  switch (type) {
    case 'accessRequest.requested':
      console.log('Access request received:', body);
      break;
    case 'accessRequest.blocked':
      console.log('Access request blocked:', body);
      break;
    case 'accessRequest.autoApprove.requireManual':
      console.log('Access request needs manual approval:', body);
      break;
    case 'accounts.created':
      console.log('Account created:', body);
      break;
    case 'accounts.nda.completed':
      console.log('NDA completed:', body);
      break;
    case 'portal.viewed':
      console.log('Trust Center viewed:', body);
      break;
    case 'portal.file.downloaded':
      console.log('File downloaded:', body);
      break;
    case 'questionnaire.completed':
      console.log('Questionnaire completed:', body);
      break;
    case 'knowledgebase.entry.created':
      console.log('Knowledge Base entry created:', body);
      break;
    case null:
      // The test event has no event name; log the body to see what arrived
      console.log('No event name in body:', body);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`SafeBase webhook server running on http://localhost:${PORT}/webhooks/safebase`);
  });
}
