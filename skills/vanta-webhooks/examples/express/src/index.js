// Generated with: vanta-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

// Top-level payload keys, one per Vanta event domain
const DOMAIN_KEYS = ['questionnaire', 'trustCenter', 'vendor', 'informationRequest', 'evidence', 'control'];

// Vanta documents the event payload (e.g. { questionnaire: {...} }) but not an
// envelope. If the body carries a `type`, use it; otherwise treat the body as
// the payload and route on its top-level key.
export function parseVantaEvent(body) {
  const typed = body && typeof body.type === 'string';
  const type = typed ? body.type : null;
  const payload = typed ? body.payload ?? body.data ?? {} : body ?? {};
  const domain = DOMAIN_KEYS.find((key) => key in payload) ?? null;
  return { type, payload, domain };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Vanta signed
app.post('/webhooks/vanta', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.VANTA_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('VANTA_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Vanta webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { type, payload, domain } = parseVantaEvent(body);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Vanta webhook ${svixId}: ${type ?? `(${domain ?? 'unknown'} payload)`}`);

  switch (type) {
    case 'v1.questionnaire.status-changed':
      console.log('Questionnaire status changed:', payload.questionnaire);
      break;
    case 'v1.questionnaire.export-completed':
      console.log('Questionnaire export ready:', payload.export?.id);
      break;
    case 'v1.vendor.decision.created':
      console.log('Vendor decision:', payload.vendor?.id, payload.vendor?.decision?.status);
      break;
    case 'v1.trust-center.access-request.received':
      console.log('Trust Center access request received:', payload.accessRequest?.id);
      break;
    case 'v1.trust-center.access-request.approved':
      console.log('Trust Center access request approved:', payload.accessRequest?.id);
      break;
    case 'v1.evidence.status-changed':
      console.log('Evidence status:', payload.evidence?.oldStatus, '->', payload.evidence?.newStatus);
      break;
    case null:
      // No type in the body: fetch the referenced object from the Manage Vanta API if needed
      console.log(`Untyped ${domain} event:`, domain ? payload[domain] : payload);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type, domain });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Vanta webhook server running on http://localhost:${PORT}/webhooks/vanta`);
  });
}
