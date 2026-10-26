// Generated with: cuuro-webhooks skill
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

// Cuuro sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names
function readSignatureHeaders(headers) {
  const prefix = headers['svix-id'] ? 'svix' : 'webhook';
  return {
    id: headers[`${prefix}-id`],
    timestamp: headers[`${prefix}-timestamp`],
    signature: headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Cuuro (Svix) signed, whatever the content type
app.post('/webhooks/cuuro', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CUURO_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('CUURO_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Cuuro webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event type is the top-level `event` field, beside `data`: { data: { id }, event }
  const type = payload.event;
  const resourceId = payload.data?.id;
  // The svix-id is stable across retries: use it to deduplicate
  console.log(`Received Cuuro webhook ${id}: ${type}`);

  switch (type) {
    case 'startup.created':
      // data.id is the id of the new target company
      console.log('Target company created:', resourceId);
      break;
    case 'analysis.created':
      // data.id is the analysis id
      console.log('Analysis created:', resourceId);
      break;
    case 'analysis.completed':
      // data.id is the analysis id; fetch the results from the Cuuro API
      console.log('Analysis completed:', resourceId);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Cuuro webhook server running on http://localhost:${PORT}/webhooks/cuuro`);
  });
}
